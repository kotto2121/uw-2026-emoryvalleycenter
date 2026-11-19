curl -s -m 3 http://127.0.0.1:4100/health && echo " | api up"
curl -s -m 3 -o /dev/null -w "next: %{http_code}\n" http://127.0.0.1:3000/
ps aux | grep -E "node.*(server|next)" | grep -v grep | awk '{print $2, $9, substr($0, index($0,$11), 80)}' | head -5
echo "---"; date