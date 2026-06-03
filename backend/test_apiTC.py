import requests

API_KEY = "cb4ea6ed-4ecf-485c-9666-2726365da1e7"

BASE_URL = "https://ollama-api.q-solutions.pk/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# read PRD file
with open("prd.md", "r", encoding="utf-8") as f:
    prd_content = f.read()

prompt = f"""
You are a Senior QA Engineer.

Generate detailed software test cases from the following PRD.

PRD:
{prd_content}

Format:
- Test Case ID
- Module
- Title
- Preconditions
- Steps
- Expected Result
- Priority
- Test Type

Generate comprehensive positive and negative test cases.
"""

payload = {
    "model": "qwen3-vl:latest",
    "messages": [
        {
            "role": "user",
            "content": prompt
        }
    ]
}

response = requests.post(
    BASE_URL,
    headers=headers,
    json=payload
)

print("STATUS CODE:", response.status_code)

print("\nRAW RESPONSE:\n")
print(response.text)

if response.status_code == 200:

    data = response.json()

    test_cases = data["choices"][0]["message"]["content"]

    print("\n===== GENERATED TEST CASES =====\n")
    print(test_cases)

    # save output
    with open("test_cases.md", "w", encoding="utf-8") as f:
        f.write(test_cases)

    print("\nSaved to test_cases.md")

else:
    print("\nAPI FAILED")