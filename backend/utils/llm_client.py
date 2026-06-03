from typing import Type, TypeVar
import json
import re
import litellm
from pydantic import BaseModel
from backend.models.schema import LLMConfig, LLMProvider

litellm.suppress_debug_info = True
litellm.drop_params = True

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODELS = {
    LLMProvider.openai:      "gpt-4o",
    LLMProvider.gemini:      "gemini/gemini-2.0-flash",
    LLMProvider.openrouter:  "openrouter/meta-llama/llama-3.1-70b-instruct",
    LLMProvider.ollama:      "ollama/llama3.1",
    LLMProvider.custom:      "Qwen3-VL:latest",
}

MAX_TOKENS = {
    LLMProvider.openai:      4096,
    LLMProvider.gemini:      4096,
    LLMProvider.openrouter:  1500,
    LLMProvider.ollama:      4096,
    LLMProvider.custom:      4096,
}


def _resolve_model(config: LLMConfig) -> str:
    raw = config.model or DEFAULT_MODELS[config.provider]
    if config.provider == LLMProvider.custom:
        return raw if raw.startswith("openai/") else f"openai/{raw}"
    if config.provider == LLMProvider.ollama:
        return raw if raw.startswith("ollama/") else f"ollama/{raw}"
    if config.provider == LLMProvider.openrouter:
        return raw if raw.startswith("openrouter/") else f"openrouter/{raw}"
    if config.provider == LLMProvider.gemini:
        return raw if raw.startswith("gemini/") else f"gemini/{raw}"
    return raw


def _build_kwargs(config: LLMConfig) -> dict:
    kwargs = {}
    if config.api_key and config.api_key.strip():
        kwargs["api_key"] = config.api_key.strip()
    else:
        kwargs["api_key"] = "none"
    if config.base_url and config.base_url.strip():
        kwargs["base_url"] = config.base_url.strip()
    elif config.provider == LLMProvider.ollama:
        kwargs["base_url"] = "http://localhost:11434"
    return kwargs


def _clean_json(raw: str) -> str:
    """Extract pure JSON from model output."""
    if not raw or not raw.strip():
        return ""

    text = raw.strip()

    # Remove <think>...</think> blocks — Qwen3 reasoning traces
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    text = re.sub(r'</?think>', '', text).strip()

    # Remove markdown fences
    text = re.sub(r'^```(?:json)?\s*\n?', '', text)
    text = re.sub(r'\n?```\s*$', '', text)
    text = text.strip()

    # Find first { or [ and last } or ]
    json_start = next((i for i, c in enumerate(text) if c in ('{', '[')), -1)
    json_end   = next((i for i in range(len(text)-1, -1, -1) if text[i] in ('}', ']')), -1)

    if json_start != -1 and json_end != -1 and json_end >= json_start:
        text = text[json_start:json_end+1]

    return text.strip()


async def _call_model(
    config: LLMConfig,
    messages: list,
    temperature: float,
) -> str:
    model  = _resolve_model(config)
    kwargs = _build_kwargs(config)
    max_tokens = MAX_TOKENS.get(config.provider, 2048)

    print(f"MODEL={model} | TEMP={temperature}")

    response = await litellm.acompletion(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )
    return (response.choices[0].message.content or "").strip()


async def llm_complete(
    config: LLMConfig,
    system: str,
    user: str,
    temperature: float = 0.2,
) -> str:
    return await _call_model(
        config=config,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=temperature,
    )


async def llm_structured(
    config: LLMConfig,
    system: str,
    user: str,
    schema: Type[T],
    temperature: float = 0.1,
    max_retries: int = 3,
) -> T:
    schema_json = json.dumps(schema.model_json_schema(), indent=2)

    # Attempt 1 & 2: ask for JSON directly
    for attempt in range(max_retries):
        if attempt == 0:
            # First try: clear JSON instruction
            sys_msg = (
                system + "\n\n"
                "OUTPUT FORMAT: Respond with ONLY a raw JSON object. "
                "No thinking, no explanation, no markdown. "
                "Start immediately with { and end with }.\n"
                f"Schema:\n{schema_json}"
            )
            user_msg = user
        elif attempt == 1:
            # Second try: show example structure
            sys_msg = (
                "You must output ONLY valid JSON. Nothing else.\n"
                f"Schema:\n{schema_json}"
            )
            user_msg = user
        else:
            # Third try: ask model to fix its own bad output
            sys_msg = (
                "Convert the following content into valid JSON matching this schema.\n"
                "Output ONLY the JSON object, nothing else.\n"
                f"Schema:\n{schema_json}"
            )
            user_msg = user

        try:
            raw = await _call_model(
                config=config,
                messages=[
                    {"role": "system", "content": sys_msg},
                    {"role": "user",   "content": user_msg},
                ],
                temperature=temperature + (attempt * 0.05),
            )

            print(f"Attempt {attempt+1} raw ({len(raw)} chars): {raw[:150]}")

            if not raw.strip():
                print(f"Attempt {attempt+1}: empty response, retrying...")
                continue

            clean = _clean_json(raw)
            print(f"Attempt {attempt+1} clean: {clean[:150]}")

            if not clean:
                print(f"Attempt {attempt+1}: no JSON found after cleaning, retrying...")
                continue

            return schema.model_validate_json(clean)

        except Exception as e:
            print(f"Attempt {attempt+1} failed: {e}")
            if attempt == max_retries - 1:
                raise ValueError(
                    f"Model returned invalid JSON after {max_retries} attempts. "
                    f"Last error: {e}. "
                    "Try a different model or check the API connection."
                )
            continue

    raise ValueError("All retry attempts exhausted")