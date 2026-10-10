#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sun_count_check.py — 「해·달이 1개인가」를 «눈»이 아니라 «픽셀»로 센다.

배경: 결함 B(하늘 가로 타일링)의 증거는 스크린샷이지만, 스크린샷을 «봤다»는 것은
      검증이 아니다. 해/달처럼 «밝고 채도 낮은 원형 덩어리»를 연결요소로 세어
      BEFORE=2 / AFTER=1 을 숫자로 남긴다.

방법: 화면 상단 45% 영역에서 「그 영역의 최대 밝기에 근접한」 픽셀을 이진화하고
      4-이웃 연결요소를 센다. 면적이 너무 작은 덩어리(눈송이·별)는 버린다.
      ⇒ 임계값을 존별로 손대지 않는다. 손대면 원하는 답이 나올 때까지 맞추게 된다.
"""
import sys, os
from collections import deque
from PIL import Image

MIN_AREA_FRAC = 0.0012   # 화면 면적 대비. 별·눈송이 제거용
TOP_FRAC = 0.45

def blobs(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    h = int(H * TOP_FRAC)
    px = im.crop((0, 0, W, h)).load()
    lum = [[0] * W for _ in range(h)]
    mx = 0
    for y in range(h):
        for x in range(W):
            r, g, b = px[x, y]
            v = (r * 299 + g * 587 + b * 114) // 1000
            lum[y][x] = v
            if v > mx:
                mx = v
    thr = int(mx * 0.93)
    seen = [[False] * W for _ in range(h)]
    minarea = int(W * H * MIN_AREA_FRAC)
    out = []
    for y0 in range(h):
        for x0 in range(W):
            if seen[y0][x0] or lum[y0][x0] < thr:
                continue
            q = deque([(x0, y0)]); seen[y0][x0] = True
            area = 0; xs = []; ys = []
            while q:
                x, y = q.popleft(); area += 1; xs.append(x); ys.append(y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < h and not seen[ny][nx] and lum[ny][nx] >= thr:
                        seen[ny][nx] = True; q.append((nx, ny))
            if area >= minarea:
                out.append((area, min(xs), max(xs), min(ys), max(ys)))
    return W, H, mx, thr, minarea, out

if __name__ == '__main__':
    for p in sys.argv[1:]:
        W, H, mx, thr, ma, bs = blobs(p)
        print('%-58s %dx%d maxLum=%d thr=%d minArea=%d -> blobs=%d %s'
              % (os.path.basename(p), W, H, mx, thr, ma, len(bs),
                 [(a, 'x%d-%d' % (x1, x2)) for a, x1, x2, _, _ in bs]))
