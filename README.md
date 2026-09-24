# goole-images

Image transport package: zlib compress + XOR(key in meta.json) + 350B binary parts.

## Restore (external side)

    python decode.py ./out

Public repo, no token needed. Output: out/capture_20260924_101750.jpg (1600x1200, 384KB).

## Layout

- pkg/meta.json : key, partSize, parts list, sha256, magic
- pkg/part_NNNN.bin : 1119 x 350B obfuscated chunks
- decode.py : restorer