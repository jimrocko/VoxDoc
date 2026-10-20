import random, sys
from PIL import Image, ImageDraw, ImageFilter
W, H, FPS = 360, 480, 5
out_dir = sys.argv[1]

def table(level=55):
    img = Image.new('L', (W, H), level)
    d = ImageDraw.Draw(img)
    rnd = random.Random(1)
    for _ in range(300):  # Holzmaserung
        x, y = rnd.randrange(W), rnd.randrange(H)
        d.line([x, y, x + rnd.randrange(20, 80), y], fill=level + rnd.randrange(-12, 12))
    return img

def page(seed, box, paper=232, level=55, rotate=0):
    img = table(level)
    pw, ph = box[2] - box[0], box[3] - box[1]
    sheet = Image.new('L', (pw, ph), paper)
    d = ImageDraw.Draw(sheet)
    rnd = random.Random(seed)
    y = 18
    while y < ph - 18:
        d.rectangle([14, y, 14 + rnd.randrange(pw // 3, pw - 28), y + 4], fill=40)
        y += rnd.choice([12, 12, 12, 22])
    if rotate:
        sheet = sheet.rotate(rotate, expand=True, fillcolor=level)
    img.paste(sheet, (box[0], box[1]))
    return img

def jitter(img, n, amount=1):
    # Leichtes Rauschen pro Bild, wie bei einer echten Kamera
    rnd = random.Random(n)
    return img.point(lambda v: max(0, min(255, v + rnd.randrange(-amount, amount + 1))))

def write(name, scenes):
    with open(f'{out_dir}/{name}.y4m', 'wb') as f:
        f.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
        n = 0
        for img, seconds in scenes:
            for _ in range(int(seconds * FPS)):
                frame = jitter(img, n).convert('RGB').convert('YCbCr')
                y, cb, cr = frame.split()
                f.write(b'FRAME\n' + y.tobytes() + cb.resize((W // 2, H // 2)).tobytes() + cr.resize((W // 2, H // 2)).tobytes())
                n += 1

centered = (50, 55, 310, 425)
write('sequence', [
    (table(), 2.5),                                   # kein Dokument
    (page(1, (-120, 70, 170, 410)), 3),               # ragt links heraus
    (page(1, centered), 4),                           # Seite 1 ruhig
    (table(), 2),                                     # Blatt weg
    (page(2, (45, 50, 305, 420), rotate=2), 4),       # Seite 2
    (table(), 6),
])
write('dark', [(page(1, centered, paper=38, level=12), 10)])
write('still', [(page(3, centered), 30)])
img = page(1, centered); img.save(f'{out_dir}/preview-centered.png'); page(1, (-120, 70, 170, 410)).save(f'{out_dir}/preview-left.png')
