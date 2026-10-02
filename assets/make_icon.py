"""Regenera assets/icon.png e icon.ico: fantasmita con anteojos, blanco sobre negro, acelerando hacia la izquierda.
Uso: python assets/make_icon.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 1024  # se dibuja grande y se reduce para suavizar bordes
BG_TOP, BG_BOT = (26, 29, 40), (8, 9, 14)
WHITE, FRAME, LENS = (255, 255, 255), (14, 16, 24), (226, 232, 250)

# deformacion del cuerpo (cabeza intacta; desde y=Y0 hacia abajo se afina y se arrastra a la derecha)
Y0, Y1 = 390, 860
TAPER, SHEAR, BEND = 0.55, 0.10, 0.40
ROT, SCALE, TX, TY = 12, 0.9, -20, 20  # rotacion (grados, antihoraria), escala y posicion final
EYE_Y, FACE_DX = 440, -34  # altura de los anteojos y cuanto se corren a la izquierda (cara de 3/4)


def vgrad(c1, c2):
    g = Image.new('RGB', (1, S))
    for y in range(S):
        t = y / (S - 1)
        g.putpixel((0, y), tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return g.resize((S, S))


def tile():
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=230, fill=255)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    img.paste(vgrad(BG_TOP, BG_BOT), (0, 0), m)
    return img


def base_ghost(top=120, half=270, bottom=720):
    """Fantasma en reposo: cabeza redonda + tronco + 3 picos abajo."""
    cx = 512
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((cx - half, top, cx + half, top + 2 * half), fill=255)
    d.rectangle((cx - half, top + half, cx + half, bottom), fill=255)
    r = half * 2 // 6
    for i in range(3):
        x = cx - half + r + i * 2 * r
        d.ellipse((x - r, bottom - r, x + r, bottom + r), fill=255)
    return m


def t_of(y):
    return max(0.0, min(1.0, (y - Y0) / (Y1 - Y0)))


def row_scale(y):
    return 1 - TAPER * t_of(y) ** 1.4


def row_shift(y):
    return SHEAR * max(0, y - Y0) + BEND * 220 * t_of(y) ** 2


def warp(mask):
    """Deforma fila por fila: afina el cuerpo y lo arrastra hacia la derecha."""
    out = Image.new('L', (S, S), 0)
    for y in range(S):
        row = mask.crop((0, y, S, y + 1))
        if row.getbbox() is None:
            continue
        w = max(1, int(S * row_scale(y)))
        out.paste(row.resize((w, 1), Image.BILINEAR), (int(512 - w / 2 + row_shift(y)), y))
    return out


def glasses(d, fx, fy, turn=0.78, lr=84, gap=104, w=22, look=-20):
    """Anteojos de 3/4: lente lejano (izq.) mas angosto, pupilas mirando a la izquierda."""
    lx, rx = fx - gap * turn, fx + gap
    lw = lr * turn
    d.line((lx, fy, rx, fy), fill=FRAME, width=w - 4)
    d.ellipse((lx - lw, fy - lr, lx + lw, fy + lr), fill=LENS, outline=FRAME, width=w)
    d.ellipse((rx - lr, fy - lr, rx + lr, fy + lr), fill=LENS, outline=FRAME, width=w)
    d.ellipse((lx - 25 + look * 0.4, fy - 25, lx + 25 + look * 0.4, fy + 25), fill=FRAME)
    d.ellipse((rx - 25 + look, fy - 25, rx + 25 + look, fy + 25), fill=FRAME)


def drop_shadow(img, mask):
    sh = Image.new('L', (S, S), 0)
    sh.paste(mask, (0, 18))
    sh = sh.filter(ImageFilter.GaussianBlur(30)).point(lambda v: v * 110 // 255)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.putalpha(sh)
    img.alpha_composite(layer)


def render():
    img = tile()
    g = warp(base_ghost())
    body = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    body.paste(Image.new('RGB', (S, S), WHITE), (0, 0), g)

    gl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glasses(ImageDraw.Draw(gl), 512 + row_shift(EYE_Y) + FACE_DX, EYE_Y)
    gl.putalpha(ImageChops.multiply(gl.getchannel('A'), g))  # los anteojos no sobresalen de la silueta
    body.alpha_composite(gl)

    n = int(S * SCALE)
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    canvas.paste(body.resize((n, n), Image.LANCZOS), ((S - n) // 2 + TX, (S - n) // 2 + TY))
    canvas = canvas.rotate(ROT, resample=Image.BICUBIC, center=(512, 512))
    drop_shadow(img, canvas.getchannel('A'))
    img.alpha_composite(canvas)
    return img


if __name__ == '__main__':
    img = render()
    out = Path(__file__).parent
    img.resize((256, 256), Image.LANCZOS).save(out / 'icon.png')
    img.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
