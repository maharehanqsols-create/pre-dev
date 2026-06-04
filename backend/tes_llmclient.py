# test_llm.py
import asyncio
from backend.models.schema import LLMConfig, LLMProvider
from backend.utils.llm_client import llm_complete, test_connection

async def main():
    # Test with OpenAI
    config = LLMConfig(
        provider=LLMProvider.openai,
        api_key="your-openai-api-key-here",  # Replace with your actual key
        model="gpt-4o-mini",
    )
    
    # Test connection
    print("Testing connection...")
    if await test_connection(config):
        print("✅ Connection successful!")
    else:
        print("❌ Connection failed!")
        return
    
    # Test completion
    print("\nTesting completion...")
    response = await llm_complete(
        config=config,
        system="You are a helpful assistant.",
        user="What is 2+2? Answer in one word.",
        temperature=0.1,
    )
    print(f"Response: {response}")

if __name__ == "__main__":
    asyncio.run(main())