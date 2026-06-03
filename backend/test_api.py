import requests

API_KEY = "cb4ea6ed-4ecf-485c-9666-2726365da1e7"
BASE_URL = "https://ollama-api.q-solutions.pk/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

payload = {
    "model": "qwen3-vl:latest",
    "messages": [
        {
            "role": "user",
            "content": "Story 1 – Select Role and See Employees As a customer admin, I want to select a role on the course assignment screen and see all employees with that role, so I can bulk-assign the course to them. Acceptance Criteria 1. The course assignment screen includes a new option: “Assign by Role” alongside existing options (Assign to Existing Employee / Assign to New Employee / Bulk Upload / Swap Participant). 2. When I choose “Assign by Role”, I see a list of roles (from the Role field on employee profiles) that belong to my customer account. 3. When I select a role: ○ A list of all employees with that role is displayed (First Name, Last Name, Email, Role). ○ All employees in the list are auto-selected via a checkbox. 4. I can uncheck one or more employees before confirming. 5. If a role has no employees, an empty state message appears: “No employees found for this role. Please add employees with this role first."
        }
    ]
}

response = requests.post(
    BASE_URL,
    headers=headers,
    json=payload
)

# check status
print("STATUS:", response.status_code)

# parse json
data = response.json()

# readable response
print("\n===== PRD OUTPUT =====\n")
print(data["choices"][0]["message"]["content"])

# save to file
with open("prd.md", "w", encoding="utf-8") as f:
    f.write(data["choices"][0]["message"]["content"])

print("\nSaved to prd.md")