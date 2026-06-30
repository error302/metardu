#!/usr/bin/env python3
"""Purge emojis from METARDU source files — replace with text equivalents."""
import re
import os

EMOJI_REPLACEMENTS = {
    '🗺️': '[Map]', '🗺': '[Map]', '🛰️': '[Sat]', '🛰': '[Sat]',
    '📍': '[Pin]', '📌': '[Pin]', '🧭': '[Compass]', '🎯': '[Target]',
    '📐': '[Compass]', '📏': '[Ruler]', '🔧': '[Tool]', '🛠️': '[Tool]', '🛠': '[Tool]',
    '⚙️': '[Config]', '⚙': '[Config]', '💾': '[Save]', '📋': '[Clip]', '📝': '[Note]',
    '📊': '[Chart]', '📈': '[TrendUp]', '📉': '[TrendDown]', '📁': '[Folder]', '📂': '[Folder]',
    '🗂️': '[Files]', '🗂': '[Files]', '🗃️': '[DB]', '🗃': '[DB]',
    '🗄️': '[Archive]', '🗄': '[Archive]',
    '✅': '[OK]', '❌': '[X]', '⚠️': '[!]', '⚠': '[!]', '🚧': '[WIP]', '🚫': '[No]',
    '🔒': '[Lock]', '🔓': '[Unlock]', '🔑': '[Key]', '🛡️': '[Shield]', '🛡': '[Shield]',
    '⭐': '[Star]', '🌟': '[Star]', '✨': '[New]', '💎': '[Pro]', '🔥': '[Hot]', '⚡': '[Fast]',
    '🚀': '[Go]', '💡': '[Tip]', '🔍': '[Search]', '🔎': '[Search]', '🔔': '[Alert]', '🔕': '[Mute]',
    '💬': '[Chat]', '📧': '[Mail]', '📞': '[Phone]', '📱': '[Mobile]', '🌐': '[Web]', '🔗': '[Link]',
    '👤': '[User]', '👥': '[Users]', '🏢': '[Office]', '🏠': '[Home]', '🏡': '[Home]',
    '🌲': '[Tree]', '🌳': '[Tree]', '🏔️': '[Mtn]', '🏔': '[Mtn]', '⛰️': '[Mtn]', '⛰': '[Mtn]',
    '🌊': '[Water]', '💧': '[Drop]', '☀️': '[Sun]', '☀': '[Sun]', '🌙': '[Moon]',
    '⛅': '[Cloud]', '☁️': '[Cloud]', '☁': '[Cloud]', '🌧️': '[Rain]', '⛈️': '[Storm]',
    '🌨️': '[Snow]', '❄️': '[Snow]', '🌬️': '[Wind]', '🌱': '[Plant]', '🌿': '[Leaf]',
    '🌾': '[Crop]', '🪨': '[Rock]',
    '🚗': '[Car]', '✈️': '[Plane]', '🚂': '[Train]', '🚢': '[Ship]', '⛵': '[Boat]',
    '⏰': '[Time]', '⏱️': '[Timer]', '📅': '[Date]', '🗓️': '[Cal]',
    '⌛': '[Wait]', '⏳': '[Wait]',
    '💰': '[Money]', '💵': '[Cash]', '💳': '[Card]', '🧾': '[Receipt]',
    '🏆': '[Award]', '🥇': '[1st]', '🏅': '[Medal]', '🎖️': '[Medal]',
    '🇰🇪': 'KE', '🇺🇬': 'UG', '🇹🇿': 'TZ', '🇷🇼': 'RW', '🇸🇸': 'SS', '🇨🇩': 'CD',
    '🇪🇹': 'ET', '🇧🇮': 'BI', '🇩🇯': 'DJ', '🇸🇴': 'SO', '🇪🇷': 'ER',
    '🇳🇬': 'NG', '🇬🇭': 'GH', '🇿🇦': 'ZA', '🇺🇸': 'US', '🇬🇧': 'UK', '🇨🇳': 'CN', '🇮🇳': 'IN',
    '⬆️': '↑', '⬇️': '↓', '➡️': '→', '⬅️': '←', '↗️': '↗', '↘️': '↘', '↖️': '↖', '↙️': '↙',
    '🔄': '[Sync]', '🔁': '[Repeat]', '✏️': '[Edit]', '✏': '[Edit]',
    '🗑️': '[Del]', '🗑': '[Del]', '📥': '[In]', '📤': '[Out]', '✂️': '[Cut]',
    '☑️': '[x]', '☒': '[x]', '▪️': '-', '▶': '>', '◀': '<',
    '👍': '[Like]', '👎': '[Dislike]', '👏': '[Clap]', '🙌': '[Cheer]', '👋': '[Wave]',
    '🤝': '[Handshake]', '🙏': '[Thanks]', '👌': '[OK]', '✌️': '[Peace]',
    '🤞': '[Fingers]', '✋': '[Stop]', '🖐️': '[Hand]', '👈': '[<-]', '👉': '[->]',
    '👆': '[^]', '👇': '[v]',
    '😀': ':)', '😁': ':D', '😂': ':D', '😃': ':)', '😄': ':D', '😅': ':)',
    '😆': 'xD', '😇': ':)', '😉': ';)', '😊': ':)', '😋': ':P', '😎': 'B)',
    '😍': '<3', '😘': ':*', '😏': ':)', '😒': ':(', '😓': ':(', '😔': ':(',
    '😞': ':(', '😟': ':(', '😠': '>:(', '😡': '>:(', '😢': ':(', '😭': ":'(",
    '😤': '>:(', '😱': 'D:', '😳': ':O', '😴': 'zzz', '🙄': '-_-', '😬': 'X(',
    '❤️': '<3', '❤': '<3', '🧡': '<3', '💛': '<3', '💚': '<3', '💙': '<3',
    '💜': '<3', '🖤': '<3', '💔': '</3', '💕': '<3', '💖': '<3', '💗': '<3',
    '💘': '<3', '💝': '<3',
    '🌤️': '[SunCloud]', '🌥️': '[Cloud]', '🌦️': '[Rain]', '🌩️': '[Storm]',
    '🌪️': '[Tornado]', '🌈': '[Rainbow]',
    '🔔': '[Bell]', '🏷️': '[Tag]', '📛': '[Badge]', '🎓': '[Grad]',
    '📚': '[Books]', '📖': '[Book]', '🔖': '[Bookmark]', '📓': '[Notebook]',
    '📔': '[Notebook]', '📒': '[Ledger]', '📎': '[Clip]', '🚩': '[Flag]',
    '♻️': '[Recycle]', '©️': '(c)', '®️': '(R)', '™️': '(TM)', 'ℹ️': '(i)',
    '☑': '[x]', '✔': '[v]', '✔️': '[v]', '✖': '[x]', '✖️': '[x]',
    '✗': '[x]', '✘': '[x]', '✕': '[x]',
    '‼️': '!!', '⁉️': '!?', '❓': '?', '❔': '?', '❕': '!', '❗': '!',
    '〰️': '~', '➰': '~', '➿': '~', '〽': '~', '✳️': '*', '✴️': '*', '❇️': '*',
    '‼': '!!', '⁉': '!?', '✳': '*', '✴': '*', '❇': '*',
    '➕': '+', '➖': '-', '➗': '/',
    '©': '(c)', '®': '(R)', '™': '(TM)', 'ℹ': '(i)',
    '⏸️': '[Pause]', '⏯️': '[Play]', '⏹️': '[Stop]', '⏺️': '[Rec]',
    '⏭️': '[Next]', '⏮️': '[Prev]', '⏩': '>>', '⏪': '<<',
    '🔼': '^', '🔽': 'v', '⏫': '^^', '⏬': 'vv',
    '🏷️': '[Tag]',
    '⚕️': '[Med]', '♻': '[Recycle]', '⚜️': '[Fleur]', '⚜': '[Fleur]',
    '🔱': '[Trident]', '🔰': '[Beginner]', '⭕': '[O]',
    '♀️': 'F', '♂️': 'M',
}

SKIP_PATTERNS = ['__tests__', '.test.', '.spec.', '/node_modules/', '/.next/', '/.git/']

def should_skip(filepath):
    for pattern in SKIP_PATTERNS:
        if pattern in filepath:
            return True
    return False

def purge_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return 0
    original = content
    replacements = 0
    for emoji, replacement in EMOJI_REPLACEMENTS.items():
        if emoji in content:
            count = content.count(emoji)
            content = content.replace(emoji, replacement)
            replacements += count
    if '\ufe0f' in content:
        content = content.replace('\ufe0f', '')
    if '\u200d' in content:
        content = content.replace('\u200d', '')
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return replacements
    return 0

def main():
    root = '/home/z/my-project/metardu/src'
    total_files = 0
    total_replacements = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.next', '.git')]
        for filename in filenames:
            if not filename.endswith(('.tsx', '.ts')):
                continue
            filepath = os.path.join(dirpath, filename)
            if should_skip(filepath):
                continue
            count = purge_file(filepath)
            if count > 0:
                total_files += 1
                total_replacements += count
    print(f"Done! Replaced {total_replacements} emojis across {total_files} files")

if __name__ == '__main__':
    main()
