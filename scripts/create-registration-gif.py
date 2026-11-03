"""登録手順のスクリーンショットを、手順名付きGIFにまとめる。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/img/help'
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
steps = [
    ('edit', '編集アイコンを押す', '自分の学年・学期を選び、右側の鉛筆アイコンを押します。'),
    ('choices', '登録したい授業の「◯」を押す', '授業名・曜日・時限を確認して、履修する授業を選びます。'),
    ('selected', '選択されたことを確認する', '背景が青くなり「✕」に変われば選択済みです。「✕」で解除できます。'),
    ('save', '保存して編集を終了する', '上部の保存アイコン、または左下の緑色の「保存」を押します。'),
    ('personal', '「自分専用」で確認する', '登録した授業だけが時間割に表示されます。'),
]
frames = []
for index, (name, title, description) in enumerate(steps, 1):
    canvas = Image.new('RGB', (1200, 900), '#ffffff')
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1200, 114), fill='#0017c1')
    draw.text((28, 14), f'{index} / 5  {title}', font=ImageFont.truetype(FONT, 30), fill='white')
    draw.text((28, 65), description, font=ImageFont.truetype(FONT, 21), fill='white')
    with Image.open(ASSETS / f'registration-{name}.png') as source:
        source = source.convert('RGB')
        source.thumbnail((1168, 754), Image.Resampling.LANCZOS)
        canvas.paste(source, ((1200-source.width)//2, 130+(754-source.height)//2))
    frames.append(canvas.quantize(colors=256))
frames[0].save(ASSETS / 'registration-guide.gif', save_all=True, append_images=frames[1:],
               duration=[3500,3500,3500,4500,4000], loop=0, disposal=2, optimize=True)
print('Created', ASSETS / 'registration-guide.gif')
