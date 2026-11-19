cd /Users/haseebqureshi/Code/emoryvalley
echo "=== db/index.js ==="
grep -n '<<<<<<<\|=======\|>>>>>>>' db/index.js
echo "=== conflict region ==="
sed -n '/<<<<<<</,/>>>>>>>/p' db/index.js
