from PIL import Image, ImageDraw
S = 1024
def make():
    img = Image.new('RGB', (S, S), (0, 122, 255))
    d = ImageDraw.Draw(img)
    # upper bubble (the other person, upside down) and lower bubble (me)
    def bubble(box, tail, fill, outline=None):
        d.rounded_rectangle(box, radius=110, fill=fill, outline=outline, width=0 if outline is None else 34)
        d.polygon(tail, fill=fill if outline is None else outline)
    bubble((210, 190, 814, 470), [(690, 190), (760, 110), (610, 190)], (255, 255, 255, 255))
    bubble((210, 554, 814, 834), [(334, 834), (264, 914), (414, 834)], (255, 255, 255))
    # lines of text
    for y, x2, c in [(285, 700, (0, 122, 255)), (375, 560, (0, 122, 255)), (650, 700, (0, 122, 255)), (740, 520, (0, 122, 255))]:
        d.rounded_rectangle((300, y - 22, x2, y + 22), radius=22, fill=c)
    return img
big = make()
big.resize((512, 512), Image.LANCZOS).save('public/icon-512.png')
big.resize((192, 192), Image.LANCZOS).save('public/icon-192.png')
big.resize((180, 180), Image.LANCZOS).save('public/apple-touch-icon.png')
