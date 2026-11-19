cd /Users/haseebqureshi/Code/emoryvalley
grep -n '<<<<<<<\|=======\|>>>>>>>' api/lib/queries.js
echo "---- conflict region ----"
sed -n '/<<<<<<</,/>>>>>>>/p' api/lib/queries.js
