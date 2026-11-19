#!/bin/bash
pids=$(lsof -ti :4100 2>/dev/null)
if [ -n "$pids" ]; then
  kill $pids 2>/dev/null
  sleep 1
  kill -9 $pids 2>/dev/null
  echo "Killed existing process(es) on :4100"
else
  echo "No process on :4100"
fi
lsof -ti :3000 :4100 2>/dev/null || echo "Ports 3000 and 4100 are free"
