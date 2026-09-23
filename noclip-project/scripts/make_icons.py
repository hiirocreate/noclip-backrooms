# Androidアイコン(黄色い部屋の出入口と光る目)を生成して android-overrides/res に出力
from PIL import Image, ImageDraw, ImageFilter
import random, os
random.seed(3)
S = 1024
im = Image.new('RGB', (S, S), '#b9a452')
d = ImageDraw.Draw(im)
for x in range(0, S, 64):
    d.rectangle([x, 0, x + 28, S], fill='#c3ae5c')
for y in range(S // 2, S):
    a = (y - S // 2) / (S / 2)
    d.line([(0, y), (S, y)], fill=(int(185 - 80 * a), int(164 - 80 * a), int(82 - 50 * a)))
glow = Image.new('L', (S, S), 0)
ImageDraw.Draw(glow).ellipse([220, -160, 804, 300], fill=255)
glow = glow.filter(ImageFilter.GaussianBlur(90))
im = Image.composite(Image.new('RGB', (S, S), '#fff6d0'), im, glow.point(lambda v: int(v * 0.8)))
d = ImageDraw.Draw(im)
d.rectangle([362, 60, 662, 100], fill='#ffffff')
d.rectangle([372, 330, 652, 1024], fill='#050403')
d.rectangle([352, 310, 672, 330], fill='#2a261e')
d.rectangle([352, 310, 372, 1024], fill='#2a261e')
d.rectangle([652, 310, 672, 1024], fill='#2a261e')
for x in (480, 544):
    e = Image.new('L', (S, S), 0)
    ImageDraw.Draw(e).ellipse([x - 12, 548, x + 12, 572], fill=255)
    e = e.filter(ImageFilter.GaussianBlur(6))
    im = Image.composite(Image.new('RGB', (S, S), '#fff2dc'), im, e)
px = im.load()
for i in range(60000):
    x = random.randrange(S); y = random.randrange(S); r, g, b = px[x, y]; n = random.randint(-18, 18)
    px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
root = os.path.join(os.path.dirname(__file__), '..', 'android-overrides', 'res')
sizes = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}
for k, (l, f) in sizes.items():
    p = os.path.join(root, f'mipmap-{k}')
    os.makedirs(p, exist_ok=True)
    small = im.resize((l, l), Image.LANCZOS)
    small.save(f'{p}/ic_launcher.png')
    m = Image.new('L', (l, l), 0); ImageDraw.Draw(m).ellipse([0, 0, l - 1, l - 1], fill=255)
    r = small.convert('RGBA'); r.putalpha(m); r.save(f'{p}/ic_launcher_round.png')
    fg = Image.new('RGBA', (f, f), (185, 164, 82, 255)); inner = int(f * 0.78)
    fg.paste(im.resize((inner, inner), Image.LANCZOS), ((f - inner) // 2, (f - inner) // 2))
    fg.save(f'{p}/ic_launcher_foreground.png')
print('icons generated')
