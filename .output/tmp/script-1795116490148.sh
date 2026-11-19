#!/bin/bash
# Kill any existing Next dev server on the default port
pids=$(lsof -ti :3000 2>/dev/null)
if [ -n "$pids" ]; then
  kill $pids 2>/dev/null
  sleep 2
  kill -9 $pids 2>/dev/null
  echo "Killed existing process(es) on :3000"
else
  echo "No existing process on :3000"
fi
