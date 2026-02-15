#!/usr/bin/env python3
"""
Simple HTTPS server for testing the Head Tilt YouTube Controller
Generates a self-signed certificate and serves the app over HTTPS
(Required for camera access)
"""

import http.server
import ssl
import os
import socket

def get_local_ip():
    """Get the local IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"

def main():
    PORT = 8000
    
    print("🎬 Head Tilt YouTube Controller - Local Server")
    print("=" * 50)
    
    # Check if certificate exists, if not create one
    if not os.path.exists('cert.pem'):
        print("\n📝 Generating self-signed certificate...")
        print("   (You'll need to accept the security warning in your browser)")
        os.system('openssl req -new -x509 -keyout cert.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"')
    
    # Create HTTPS server
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)
    
    # Wrap with SSL
    httpd.socket = ssl.wrap_socket(httpd.socket,
                                   certfile='./cert.pem',
                                   server_side=True)
    
    local_ip = get_local_ip()
    
    print(f"\n✅ Server started!")
    print(f"\n📱 Access on this device:")
    print(f"   https://localhost:{PORT}")
    print(f"\n📱 Access on mobile (same WiFi):")
    print(f"   https://{local_ip}:{PORT}")
    print(f"\n⚠️  Note: You'll need to accept the self-signed certificate warning")
    print(f"    in your browser (this is normal for local development)\n")
    print(f"Press Ctrl+C to stop the server\n")
    print("=" * 50)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped")

if __name__ == '__main__':
    main()
