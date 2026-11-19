#!/bin/bash
cp /tmp/icon_out.png "/Users/haseebqureshi/Code/emoryvalley/electron/assets/icon.png"
cp /tmp/icon_out.png "/Users/haseebqureshi/Code/emoryvalley/build/icon.png"
sips -g pixelWidth -g pixelHeight electron/assets/icon.png build/icon.png