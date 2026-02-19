#!/bin/bash
set -e
npm run build

# Replace index.html with a redirect to editor.html.
# Vercel serves index.html for the root path; this ensures the editor
# loads instead of the library entry point.
cat > build/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=editor.html">
<script>location.replace('editor.html');</script>
</head>
<body></body>
</html>
EOF
