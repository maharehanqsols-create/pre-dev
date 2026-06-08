# backend/utils/llm_client.py
"""
LLM Client - Unified interface for all LLM operations
"""
from typing import Type, TypeVar, Optional, List, Dict, Any
import json
import re
import litellm
from pydantic import BaseModel
from backend.models.schema import LLMConfig, LLMProvider

T = TypeVar("T", bound=BaseModel)

# Configure litellm
litellm.suppress_debug_info = True
litellm.drop_params = True

# Default models for each provider
DEFAULT_MODELS = {
    LLMProvider.openai:      "gpt-4o",
    LLMProvider.gemini:      "gemini/gemini-2.0-flash",
    LLMProvider.openrouter:  "openrouter/meta-llama/llama-3.1-70b-instruct",
    LLMProvider.ollama:      "ollama/llama3.1",
    LLMProvider.custom:      "Qwen3-VL:latest",
}

# Max tokens per provider
MAX_TOKENS = {
    LLMProvider.openai:      4096,
    LLMProvider.gemini:      4096,
    LLMProvider.openrouter:  1500,
    LLMProvider.ollama:      4096,
    LLMProvider.custom:      4096,
}

# Providers that use official APIs (no custom base_url)
CLOUD_PROVIDERS = {LLMProvider.openai, LLMProvider.gemini, LLMProvider.openrouter}


def resolve_model(config: LLMConfig) -> str:
    """Resolve the full model name with provider prefix"""
    raw = config.model or DEFAULT_MODELS[config.provider]
    
    # For custom OpenAI-compatible endpoints, prefix with openai/
    if config.provider == LLMProvider.custom:
        if raw.startswith("openai/"):
            return raw
        return f"openai/{raw}"
    
    if config.provider == LLMProvider.ollama:
        return raw if raw.startswith("ollama/") else f"ollama/{raw}"
    
    if config.provider == LLMProvider.openrouter:
        return raw if raw.startswith("openrouter/") else f"openrouter/{raw}"
    
    if config.provider == LLMProvider.gemini:
        return raw if raw.startswith("gemini/") else f"gemini/{raw}"
    
    # OpenAI and others
    return raw


def build_kwargs(config: LLMConfig) -> dict:
    """Build litellm kwargs from config"""
    kwargs = {}
    
    # Add API key if provided
    if config.api_key and config.api_key.strip():
        kwargs["api_key"] = config.api_key.strip()
    elif config.provider in CLOUD_PROVIDERS:
        # Cloud providers require API keys
        print(f"⚠️ Warning: No API key provided for {config.provider}")
    
    # Only add base_url for providers that support custom endpoints
    if config.provider not in CLOUD_PROVIDERS:
        if config.base_url and config.base_url.strip():
            kwargs["base_url"] = config.base_url.strip()
            print(f"📍 Using custom base_url for {config.provider}: {config.base_url}")
        elif config.provider == LLMProvider.ollama:
            kwargs["base_url"] = "http://localhost:11434"
            print(f"📍 Using default Ollama base_url: http://localhost:11434")
    
    # Debug logging
    print(f"🤖 Provider: {config.provider}")
    print(f"📝 Model: {resolve_model(config)}")
    print(f"🔑 Has API Key: {bool(config.api_key)}")
    print(f"🌐 Base URL: {kwargs.get('base_url', 'Not set (using default)')}")
    
    return kwargs


def _extract_json_candidate(text: str) -> str:
    """Return the best JSON substring from a cleaned text block."""
    stack = []
    in_string = False
    escape = False
    valid_end = -1

    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch in '{[':
            stack.append(ch)
        elif ch in '}]':
            if not stack:
                continue
            last = stack[-1]
            if (last == '{' and ch == '}') or (last == '[' and ch == ']'):
                stack.pop()
                if not stack:
                    valid_end = i
            else:
                continue

    if valid_end != -1:
        return text[:valid_end + 1]

    if stack:
        closing = ''.join('}' if c == '{' else ']' for c in reversed(stack))
        return text + closing

    return text


def clean_json(raw: str) -> str:
    """Extract pure JSON from model output"""
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

    json_start = next((i for i, c in enumerate(text) if c in ('{', '[')), -1)
    if json_start == -1:
        return ""

    return _extract_json_candidate(text[json_start:]).strip()


async def call_model(
    config: LLMConfig,
    messages: List[Dict[str, str]],
    temperature: float,
) -> str:
    """Make the actual LLM call"""
    model = resolve_model(config)
    kwargs = build_kwargs(config)
    max_tokens = MAX_TOKENS.get(config.provider, 2048)

    print(f"🚀 Calling LLM: {model} | Temperature: {temperature} | Max tokens: {max_tokens}")

    try:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        content = (response.choices[0].message.content or "").strip()
        print(f"✅ LLM response received ({len(content)} chars)")
        return content
    except Exception as e:
        print(f"❌ LLM call failed: {e}")
        raise


async def llm_complete(
    config: LLMConfig,
    system: str,
    user: str,
    temperature: float = 0.2,
) -> str:
    """Simple LLM completion without structured output"""
    return await call_model(
        config=config,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
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
    """Get structured JSON output from LLM"""
    schema_json = json.dumps(schema.model_json_schema(), indent=2)

    for attempt in range(max_retries):
        try:
            # Adjust prompt based on attempt
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
                # Second try: even stricter
                sys_msg = (
                    "You must output ONLY valid JSON. Nothing else.\n"
                    f"Schema:\n{schema_json}\n\n"
                    "Do not include any text before or after the JSON."
                )
                user_msg = user
            else:
                # Third try: ask model to fix its own bad output
                sys_msg = (
                    "The previous response was not valid JSON. "
                    "Convert the following content into valid JSON matching this schema.\n"
                    "Output ONLY the JSON object, nothing else.\n"
                    f"Schema:\n{schema_json}"
                )
                user_msg = user

            # Adjust temperature slightly on retries
            current_temp = min(temperature + (attempt * 0.05), 0.5)
            
            raw = await call_model(
                config=config,
                messages=[
                    {"role": "system", "content": sys_msg},
                    {"role": "user", "content": user_msg},
                ],
                temperature=current_temp,
            )

            print(f"📝 Attempt {attempt+1} raw response ({len(raw)} chars): {raw[:150]}...")

            if not raw.strip():
                print(f"⚠️ Attempt {attempt+1}: empty response, retrying...")
                continue

            clean = clean_json(raw)
            print(f"🧹 Attempt {attempt+1} cleaned: {clean[:150]}...")

            if not clean:
                print(f"⚠️ Attempt {attempt+1}: no JSON found after cleaning, retrying...")
                continue

            # Validate and parse JSON
            result = schema.model_validate_json(clean)
            print(f"✅ Successfully parsed JSON on attempt {attempt+1}")
            return result

        except Exception as e:
            print(f"❌ Attempt {attempt+1} failed: {e}")
            if attempt == max_retries - 1:
                raise ValueError(
                    f"Model returned invalid JSON after {max_retries} attempts. "
                    f"Last error: {e}. "
                    "Try a different model or check the API connection."
                )
            continue

    raise ValueError("All retry attempts exhausted")


# Convenience function to test the connection
async def test_connection(config: LLMConfig) -> bool:
    """Test if the LLM connection works"""
    try:
        response = await llm_complete(
            config=config,
            system="You are a helpful assistant.",
            user="Say 'OK' in one word.",
            temperature=0.1,
        )
        return response.strip().upper() == "OK"
    except Exception as e:
        print(f"Connection test failed: {e}")
        return False