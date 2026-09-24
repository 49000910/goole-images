# goole-images

Image Folder Chunk Packaging.
Pipeline: raw bytes -> zlib -> XOR(key=123) -> base64 -> N x chunk_size text chunks.

## Pack layout

    image_pack_001/
    |- meta.json          name, chunk_size, method, chunks[], sha256
    |- chunks/part_NNNN.bin
    |- encode.py          pack one image (chunk_size arg, default 8192)
    |- decode.py          restore one pack (meta-driven, sha256 verify)

## Batch tools (tools/)

    pack_folder.py  <image_dir> <out_root> [chunk_size]   # one pack per image + index.json
    decode_all.py   <packs_root> <out_dir>                # restore all packs

## Restore

    python image_pack_001/decode.py image_pack_001 ./out

Public repo, no token needed.

## Current packs

- image_pack_001: capture_20260924_101750.jpg (4000x3000, 4194348 bytes, chunk 4096)