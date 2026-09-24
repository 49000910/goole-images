# goole-images

Image Folder Chunk Packaging.
Pipeline: raw bytes -> zlib -> XOR(key=123) -> base64 -> N x chunk_size text chunks.

## Packs

| pack | file | size | chunk |
|---|---|---|---|
| image_pack_001 | capture_20260924_101750.jpg (4000x3000) | 4194348 | 4096 |
| image_pack_002 | capture_20260924_151933.jpg | 4505606 | 16384 |
| image_pack_003 | capture_20260924_182329.jpg | 2864685 | 16384 |
| script_pack_001 | SN编码自动校验...-v2.7.18.user.js | 83716 | 16384 |
| script_pack_002 | MES 一体化...-v3.4.12.user.js | 120391 | 16384 |

All packs verified: restored byte-identical (sha256).

## 油猴脚本

油猴脚本/ 目录: 21 个脚本直接存放; 最大的 2 个在 script_pack_001/002 (还原后同名).

## Restore

    git clone https://github.com/49000910/goole-images.git
    cd goole-images
    python tools/decode_all.py . ./out      # 还原所有 pack
    # 或单包:
    python image_pack_002/decode.py image_pack_002 ./out

Public repo, no token needed.

## Batch tools (tools/)

    pack_folder.py  <image_dir> <out_root> [chunk_size]   # default 8192
    decode_all.py   <packs_root> <out_dir>                # any dir with meta.json