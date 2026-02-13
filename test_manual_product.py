#!/usr/bin/env python3
"""Test script for manual product creation API"""
import json
import urllib.request
import urllib.error
import base64
import os
from pathlib import Path

# Load environment to get credentials
from dotenv import load_dotenv
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

API_BASE = 'http://localhost:5000'

def login():
    """Login and get JWT token"""
    url = f'{API_BASE}/api/auth/login'
    payload = {
        'email': os.environ.get('ADMIN_EMAIL', 'sgcgartglass@gmail.com'),
        'password': 'MissingAnnabelle'
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result['token']
    except urllib.error.HTTPError as e:
        print(f"Login failed: {e.code}")
        print(e.read().decode('utf-8'))
        return None

def create_sample_image():
    """Create a simple base64 image for testing"""
    # 1x1 red pixel PNG
    png_data = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf'
        b'\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00'
        b'IEND\xaeB`\x82'
    )
    return 'data:image/png;base64,' + base64.b64encode(png_data).decode('utf-8')

def create_manual_product(token):
    """Create a manual product"""
    url = f'{API_BASE}/api/manual-products'
    
    product_data = {
        'name': 'Test Glass Bowl',
        'description': 'Beautiful hand-blown glass bowl with vibrant colors',
        'category': 'Bowl',
        'materials': 'Hand-blown glass, colored glass',
        'width': 8.5,
        'height': 4.0,
        'depth': 8.5,
        'price': 125.00,
        'quantity': 3,
        'images': [
            {
                'url': create_sample_image(),
                'type': 'image'
            }
        ]
    }
    
    print("Creating product with data:")
    print(json.dumps(product_data, indent=2))
    
    req = urllib.request.Request(
        url,
        data=json.dumps(product_data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        },
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("\n✅ Product created successfully!")
            print(json.dumps(result, indent=2))
            return result
    except urllib.error.HTTPError as e:
        print(f"\n❌ Failed to create product: {e.code}")
        error_body = e.read().decode('utf-8')
        print(error_body)
        try:
            error_data = json.loads(error_body)
            print(f"Error: {error_data.get('error')}")
            print(f"Detail: {error_data.get('detail')}")
        except:
            pass
        return None

def list_manual_products():
    """List all manual products"""
    url = f'{API_BASE}/api/manual-products'
    
    try:
        with urllib.request.urlopen(url) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("\n📦 Manual Products:")
            print(json.dumps(result, indent=2))
            return result
    except urllib.error.HTTPError as e:
        print(f"Failed to list products: {e.code}")
        return None

if __name__ == '__main__':
    print("🔐 Logging in...")
    token = login()
    
    if token:
        print(f"✅ Login successful! Token: {token[:20]}...")
        
        print("\n🔨 Creating manual product...")
        product = create_manual_product(token)
        
        print("\n📋 Listing all manual products...")
        list_manual_products()
    else:
        print("❌ Login failed. Cannot proceed.")
