#!/usr/bin/env python3
"""
Simple HTTP Server for Chandra Hi Tech ENT Hospital Website
Run this to access the website at http://localhost:8000
"""

import http.server
import socketserver
import os
import sys

# Change to the website directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add headers to prevent caching during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.log_date_time_string()}] {format % args}")

if __name__ == "__main__":
    Handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print("=" * 60)
            print("🏥 Chandra Hi Tech ENT Hospital Website Server")
            print("=" * 60)
            print(f"\n✅ Server running at: http://localhost:{PORT}")
            print(f"📁 Serving files from: {os.getcwd()}")
            print("\n📖 Available pages:")
            print(f"   • Homepage:    http://localhost:{PORT}/index.html")
            print(f"   • About:       http://localhost:{PORT}/about.html")
            print(f"   • Services:    http://localhost:{PORT}/services.html")
            print(f"   • Departments: http://localhost:{PORT}/departments.html")
            print(f"   • Contact:     http://localhost:{PORT}/contact.html")
            print("\n⌨️  Press Ctrl+C to stop the server\n")
            print("=" * 60)
            
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"\n❌ Error: Port {PORT} is already in use!")
            print(f"   Try stopping other servers or use a different port.")
        else:
            print(f"\n❌ Error: {e}")
        sys.exit(1)

# Made with Bob
