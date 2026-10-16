"""Render three original, caption-led METARDU motion ads without paid services.

Requires existing Pillow and FFmpeg. Frames stream to FFmpeg; no frame cache.
Outputs are ignored build artifacts. All depicted geometry is illustrative.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess
import wave
from array import array
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H, FPS, DURATION = 1080, 1920, 24, 15
BG, INK, MUTED, ACCENT = '#101413', '#f1efe7', '#a8ada5', '#d17b47'
FONTS = Path('C:/Windows/Fonts')
FONT = lambda size, bold=False: ImageFont.truetype(str(FONTS / ('seguisb.ttf' if bold else 'segoeui.ttf')), size)
MONO = lambda size: ImageFont.truetype(str(FONTS / 'consola.ttf'), size)
LOGO = Image.open(ROOT / 'public/metardu-icon.png').convert('RGBA').resize((100, 100), Image.Resampling.LANCZOS)
ADS = [
    {'file': '01-your-survey-one-workspace', 'hook': ['Your survey.', 'One workspace.'], 'body': ['Calculations. Maps. CAD.', 'Keep the work connected.'], 'cta': ['Explore METARDU.', 'Bring your workflow.'], 'tag': 'FOR SURVEYORS & SURVEY TEAMS'},
    {'file': '02-see-the-numbers', 'hook': ['Know the numbers.', 'See the work.'], 'body': ['Distance. Bearing. Area.', 'Tools for your next check.'], 'cta': ['Try a survey tool.', 'Start with METARDU.'], 'tag': 'COORDINATE GEOMETRY'},
    {'file': '03-part-of-your-workflow', 'hook': ['Built for surveyors.', 'Shaped with you.'], 'body': ['From field observations', 'to the next handoff.'], 'cta': ['Create your account.', 'Help shape METARDU.'], 'tag': 'BUILT IN KENYA'},
]

def ease(t):
    t = min(1, max(0, t))
    return 1 - (1-t)**3

def lines(draw, values, y, size=86, color=INK, x=84, gap=12):
    for text in values:
        draw.text((x, y), text, font=FONT(size, True), fill=color)
        y += size + gap

def stroke(draw, points, progress, color=ACCENT, width=7):
    lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
    remaining = sum(lengths) * min(1, max(0, progress))
    for a, b, length in zip(points, points[1:], lengths):
        if remaining <= 0: break
        ratio = min(1, remaining / length)
        end = (a[0] + (b[0]-a[0])*ratio, a[1] + (b[1]-a[1])*ratio)
        draw.line([a, end], fill=color, width=width)
        remaining -= length

def frame(index, t):
    im = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(im)
    # Quiet, moving coordinate grid, with a deliberately clear text area.
    offset = int(t * 7) % 90
    for x in range(-90+offset, W, 90): draw.line((x, 650, x, 1410), fill='#202823', width=1)
    for y in range(650+offset, 1410, 90): draw.line((84, y, 996, y), fill='#202823', width=1)
    im.paste(LOGO, (84, 112), LOGO)
    draw.text((208, 130), 'METARDU', font=FONT(44, True), fill=INK)
    draw.text((84, 252), ADS[index]['tag'], font=MONO(24), fill=ACCENT)
    if t < 4.2:
        caption, reveal = ADS[index]['hook'], ease(t/0.7)
    elif t < 10.5:
        caption, reveal = ADS[index]['body'], ease((t-4.2)/0.7)
    else:
        caption, reveal = ADS[index]['cta'], ease((t-10.5)/0.7)
    lines(draw, caption, 340 + int((1-reveal)*38), size=82 if index != 1 else 80)
    if index == 0:
        points = [(205, 1010), (625, 760), (885, 1100), (350, 1270), (205, 1010)]
        if t > 1: draw.polygon(points, fill='#1d2a24')
        stroke(draw, points, ease((t-0.7)/3.0))
        for i, (x,y) in enumerate(points[:-1]):
            if t > 0.8+i*0.6:
                r = 10 + 3*math.sin(t*3+i)
                draw.ellipse((x-r,y-r,x+r,y+r), fill=ACCENT)
                draw.text((x+18,y-38), chr(65+i), font=MONO(30), fill=INK)
        if t > 5: draw.line((205,1010,885,1100), fill='#7d9584', width=3)
        draw.text((84, 1350), 'ILLUSTRATIVE GEOMETRY', font=MONO(23), fill=MUTED)
    elif index == 1:
        a, c, b = (230, 1260), (680, 1260), (680, 660)
        stroke(draw, [a,c,b], ease((t-.5)/2), color='#6c7d70', width=4)
        stroke(draw, [a,b], ease((t-1.3)/2.0), width=9)
        for x,y in [a,b]: draw.ellipse((x-13,y-13,x+13,y+13), fill=ACCENT)
        if t > 2.5:
            draw.text((400, 1285), '30 m', font=MONO(36), fill=MUTED)
            draw.text((700, 950), '40 m', font=MONO(36), fill=MUTED)
        if t > 4.7:
            draw.rounded_rectangle((400,870,665,960), radius=12, fill=ACCENT)
            draw.text((449,884), '50 m', font=MONO(54), fill='#111513')
        draw.text((84, 1350), 'ILLUSTRATIVE 30–40–50 COORDINATE EXAMPLE', font=MONO(23), fill=MUTED)
    else:
        labels = ['Observe', 'Compute', 'Review', 'Deliver']
        pts = [(230,820),(830,820),(830,1180),(230,1180)]
        stroke(draw, pts, ease((t-.8)/3.7), color='#6c7d70', width=5)
        for i, (x,y) in enumerate(pts):
            if t < .5+i*.7: continue
            draw.ellipse((x-53,y-53,x+53,y+53), fill='#1f2d25', outline=ACCENT, width=3)
            draw.text((x-15,y-29), str(i+1), font=MONO(44), fill=INK)
            draw.text((x-84,y+76), labels[i], font=FONT(31, True), fill=INK)
        draw.text((84, 1390), 'YOUR PROFESSIONAL JUDGMENT STAYS CENTRAL.', font=MONO(23), fill=MUTED)
    draw.line((84, 1460, 996, 1460), fill='#354037', width=2)
    if t >= 10.5:
        draw.text((84, 1510), 'metardu.space', font=FONT(68, True), fill=ACCENT)
        draw.text((84, 1600), 'Explore tools · Create an account', font=FONT(31), fill=INK)
    else:
        draw.text((84, 1510), 'Survey calculations, drawings', font=FONT(36), fill=INK)
        draw.text((84, 1560), 'and project records.', font=FONT(36), fill=INK)
    draw.text((84, 1700), 'Outputs require professional review.', font=FONT(24), fill=MUTED)
    draw.line((84, 1808, 84+int(912*t/DURATION), 1808), fill=ACCENT, width=4)
    return im

def soundtrack(path):
    # Original quiet pulse, with no third-party recordings or licensed music.
    sr, samples = 48000, array('h')
    for i in range(sr*DURATION):
        t = i/sr
        beat = t % .75
        pulse = math.sin(2*math.pi*110*t)*math.exp(-beat*12)*.095
        ambient = (math.sin(2*math.pi*220*t)+math.sin(2*math.pi*330*t))*.016
        envelope = min(1,t/.6,(DURATION-t)/.7)
        samples.append(int(32767*(pulse+ambient)*max(0,envelope)))
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes(samples.tobytes())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/marketing/metardu-launch')
    args = parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    for index, ad in enumerate(ADS): frame(index, 7).save(args.output/(ad['file']+'.jpg'), quality=92)
    if args.preview: return
    audio = args.output/'original-pulse.wav'; soundtrack(audio)
    for index, ad in enumerate(ADS):
        out = args.output/(ad['file']+'.mp4')
        command = ['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-i',str(audio),'-c:v','libx264','-preset','fast','-crf','20','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-t',str(DURATION),str(out)]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as process:
            for n in range(FPS*DURATION): process.stdin.write(frame(index,n/FPS).tobytes())
            process.stdin.close()
            if process.wait() != 0: raise RuntimeError(f'Failed to encode {out}')
        print(f'Rendered {out.name}', flush=True)
    (args.output/'manifest.json').write_text(json.dumps({'size':[W,H],'fps':FPS,'seconds':DURATION,'geometry':'illustrative only','audio':'original procedural pulse','logo':'public/metardu-icon.png','files':[ad['file']+'.mp4' for ad in ADS]},indent=2)+'\n')

if __name__ == '__main__': main()
