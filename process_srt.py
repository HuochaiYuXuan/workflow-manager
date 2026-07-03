import os
import re
import sys

def parse_srt(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split by empty lines to get subtitle blocks
    blocks = content.split('\n\n')
    subtitles = []
    
    for block in blocks:
        if not block.strip():
            continue
        
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            try:
                idx = int(lines[0].strip())
                timecode = lines[1].strip()
                text = '\n'.join(lines[2:]).strip()
                if text:
                    subtitles.append({
                        'index': idx,
                        'timecode': timecode,
                        'text': text
                    })
            except:
                continue
    
    return subtitles

def format_time(ms):
    seconds = ms // 1000
    milliseconds = ms % 1000
    minutes = seconds // 60
    seconds = seconds % 60
    hours = minutes // 60
    minutes = minutes % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def parse_timecode(timecode):
    match = re.match(r'(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})', timecode)
    if match:
        start_ms = int(match.group(1)) * 3600000 + int(match.group(2)) * 60000 + int(match.group(3)) * 1000 + int(match.group(4))
        end_ms = int(match.group(5)) * 3600000 + int(match.group(6)) * 60000 + int(match.group(7)) * 1000 + int(match.group(8))
        return start_ms, end_ms
    return None, None

def clean_text(text):
    text = text.strip()
    
    # Remove zero-width and invisible characters
    zero_width_chars = [
        '\u200b', '\u200c', '\u200d', '\u200e', '\u200f',  # Zero-width characters
        '\u202a', '\u202b', '\u202c', '\u202d', '\u202e',  # Bidirectional marks
        '\u2060', '\u2061', '\u2062', '\u2063', '\u2064',  # Invisible math operators
        '\u2066', '\u2067', '\u2068', '\u2069', '\u206a', '\u206b',  # Directional formatting
    ]
    for char in zero_width_chars:
        text = text.replace(char, '')
    
    # Remove punctuation
    text = re.sub(r'[，。！？、；：""''""（）《》【】—…·]', '', text)
    
    # Remove filler words
    fillers = ['嗯', '啊', '呃', '哈', '哦', '呀', '吧', '呢', '嘛', '呢', '呗']
    for filler in fillers:
        text = text.replace(filler, '')
    
    # Fix common recognition errors
    text = text.replace('的地', '地').replace('得地', '地')
    text = text.replace('的得', '得').replace('地得', '得')
    
    return text.strip()

def split_long_subtitle(subtitle):
    text = subtitle['text']
    start_ms, end_ms = parse_timecode(subtitle['timecode'])
    
    if start_ms is None or end_ms is None:
        return [subtitle]
    
    # If already short enough, return as is
    if len(text) <= 14:
        return [subtitle]
    
    # Split by meaningful breaks
    parts = []
    current_part = ''
    
    # Try to split at natural pauses
    chars = list(text)
    for i, char in enumerate(chars):
        current_part += char
        
        # Check if we should split
        if len(current_part) >= 14:
            # Look for a good split point nearby
            split_at = len(current_part)
            
            # Prefer to split after punctuation or natural breaks
            for j in range(len(current_part)-1, max(0, len(current_part)-5), -1):
                if current_part[j] in [' ', '，', '。', '！', '？', '；', '：']:
                    split_at = j + 1
                    break
            
            part_text = current_part[:split_at].strip()
            if part_text:
                parts.append(part_text)
            current_part = current_part[split_at:].strip()
    
    if current_part.strip():
        parts.append(current_part.strip())
    
    # Distribute time across parts
    duration = end_ms - start_ms
    total_chars = sum(len(p) for p in parts)
    
    result = []
    current_time = start_ms
    
    for i, part in enumerate(parts):
        if total_chars > 0:
            part_duration = int((len(part) / total_chars) * duration)
        else:
            part_duration = int(duration / len(parts))
        
        if i == len(parts) - 1:
            part_end = end_ms
        else:
            part_end = current_time + part_duration
        
        result.append({
            'index': f"{subtitle['index']}{chr(ord('a') + i)}",
            'timecode': f"{format_time(current_time)} --> {format_time(part_end)}",
            'text': part
        })
        
        current_time = part_end
    
    return result

def process_subtitles(subtitles):
    cleaned = []
    
    for sub in subtitles:
        # Clean the text
        clean_sub = {
            'index': sub['index'],
            'timecode': sub['timecode'],
            'text': clean_text(sub['text'])
        }
        
        # Skip empty after cleaning
        if not clean_sub['text']:
            continue
        
        # Split if too long
        split_parts = split_long_subtitle(clean_sub)
        cleaned.extend(split_parts)
    
    return cleaned

def write_srt(subtitles, file_path):
    with open(file_path, 'w', encoding='utf-8') as f:
        for i, sub in enumerate(subtitles):
            f.write(f"{sub['index']}\n")
            f.write(f"{sub['timecode']}\n")
            f.write(f"{sub['text']}\n")
            if i < len(subtitles) - 1:
                f.write("\n")

def process_srt_file(input_path, output_path):
    print(f"Processing {input_path}...")
    subtitles = parse_srt(input_path)
    cleaned = process_subtitles(subtitles)
    write_srt(cleaned, output_path)
    print(f"   -> {output_path} ({len(cleaned)} subtitles)")
    return cleaned

def main():
    srt_dir = 'j:/ai/工序管理3/srt'
    output_dir = 'j:/ai/工序管理3/srt_clean'
    
    os.makedirs(output_dir, exist_ok=True)
    
    srt_files = [f for f in os.listdir(srt_dir) if f.endswith('.srt')]
    
    for srt_file in srt_files:
        input_path = os.path.join(srt_dir, srt_file)
        output_name = srt_file.replace('_原文.srt', '.clean.srt')
        output_path = os.path.join(output_dir, output_name)
        process_srt_file(input_path, output_path)
    
    print("\nProcessing complete!")

if __name__ == '__main__':
    main()
