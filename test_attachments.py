import requests
import base64
import json
import uuid

API_BASE_URL = "http://localhost:8002/api/v1"

def create_test_files():
    files = []
    
    # 1. Plain Text File
    text_content = "This is a test plain text file content."
    files.append({
        "file_name": "test.txt",
        "mime_type": "text/plain",
        "data": base64.b64encode(text_content.encode()).decode()
    })
    
    # 2. Markdown File
    md_content = "# Test Markdown\n\nThis is a **bold** test."
    files.append({
        "file_name": "test.md",
        "mime_type": "text/markdown",
        "data": base64.b64encode(md_content.encode()).decode()
    })
    
    # 3. Dummy Image (1x1 transparent pixel)
    image_data = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
    files.append({
        "file_name": "test.gif",
        "mime_type": "image/gif",
        "data": base64.b64encode(image_data).decode()
    })
    
    return files

def test_flow():
    print("--- Starting Attachment Feature Test ---")
    
    # 1. Create a session
    session_payload = {
        "title": "Attachment Test Session",
        "path": "/home/niceiyke",
        "cli_id": None
    }
    resp = requests.post(f"{API_BASE_URL}/chat/sessions", json=session_payload)
    if resp.status_code != 200:
        print(f"Failed to create session: {resp.text}")
        return
    
    session = resp.json()
    session_id = session['id']
    print(f"Created Session ID: {session_id}")
    
    # 2. Prepare message with attachments
    attachments = create_test_files()
    message_payload = {
        "role": "user",
        "content": "Analyze these files: a text file, a markdown file, and a small image.",
        "attachments": attachments
    }
    
    print(f"Sending message with {len(attachments)} attachments...")
    resp = requests.post(f"{API_BASE_URL}/chat/sessions/{session_id}/messages", json=message_payload)
    
    if resp.status_code == 200:
        print("Success! Message sent to backend.")
        print(f"AI Response Placeholder: {resp.json().get('content')}")
        print("\nNote: The backend has triggered the n8n webhook in the background.")
        print("Check your n8n execution log to verify the SSH commands generated for:")
        for att in attachments:
            print(f" - {att['file_name']} ({att['mime_type']})")
    else:
        print(f"Failed to send message: {resp.text}")

if __name__ == "__main__":
    try:
        test_flow()
    except Exception as e:
        print(f"Error: {e}")
