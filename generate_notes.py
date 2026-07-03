import os
import re

def parse_srt(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
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
                    start_ms, end_ms = parse_timecode(timecode)
                    subtitles.append({
                        'index': idx,
                        'start_ms': start_ms,
                        'end_ms': end_ms,
                        'timecode': timecode,
                        'text': text
                    })
            except:
                continue
    
    return subtitles

def parse_timecode(timecode):
    match = re.match(r'(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})', timecode)
    if match:
        start_ms = int(match.group(1)) * 3600000 + int(match.group(2)) * 60000 + int(match.group(3)) * 1000 + int(match.group(4))
        end_ms = int(match.group(5)) * 3600000 + int(match.group(6)) * 60000 + int(match.group(7)) * 1000 + int(match.group(8))
        return start_ms, end_ms
    return 0, 0

def format_time(ms):
    seconds = ms // 1000
    milliseconds = ms % 1000
    minutes = seconds // 60
    seconds = seconds % 60
    hours = minutes // 60
    minutes = minutes % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

def extract_topics(subtitles):
    topics = []
    current_topic = []
    
    topic_triggers = [
        '介绍', '讲解', '演示', '说明', '原理', '步骤', '方法', '技巧',
        '重点', '核心', '设置', '配置', '制作', '实现', '注意', '问题'
    ]
    
    for sub in subtitles:
        text = sub['text']
        
        has_trigger = any(trigger in text for trigger in topic_triggers)
        
        if has_trigger and len(current_topic) >= 10:
            topics.append(current_topic)
            current_topic = [sub]
        else:
            current_topic.append(sub)
    
    if current_topic:
        topics.append(current_topic)
    
    return topics

def extract_key_points(subtitles):
    key_points = []
    all_text = ' '.join(sub['text'] for sub in subtitles)
    
    patterns = [
        (r'([\u4e00-\u9fa5]+参数)[，。！？]', '参数说明'),
        (r'(范围是从[\u4e00-\u9fa50-9\-]+到[\u4e00-\u9fa50-9\-]+)', '参数范围'),
        (r'(首先[\u4e00-\u9fa5]+)[，。]', '操作步骤'),
        (r'(然后[\u4e00-\u9fa5]+)[，。]', '操作步骤'),
        (r'(接下来[\u4e00-\u9fa5]+)[，。]', '操作步骤'),
        (r'(选中[\u4e00-\u9fa5]+)[，。]', '操作动作'),
        (r'(调整[\u4e00-\u9fa5]+)[，。]', '操作动作'),
        (r'(制作[\u4e00-\u9fa5]+)[，。]', '操作动作'),
        (r'(设置[\u4e00-\u9fa5]+)[，。]', '操作动作'),
        (r'(给[\u4e00-\u9fa5]+打上[\u4e00-\u9fa5]+)', '关键操作'),
        (r'(使用[\u4e00-\u9fa5]+功能)', '功能使用'),
        (r'(当[\u4e00-\u9fa5]+时)[，。]', '条件说明'),
        (r'(注意[\u4e00-\u9fa5]+)[，。]', '注意事项'),
    ]
    
    for pattern, category in patterns:
        matches = re.findall(pattern, all_text)
        for match in matches[:5]:
            key_points.append({'content': match, 'category': category})
    
    return key_points

def generate_structured_notes(subtitles, title):
    notes = []
    notes.append(f"# {title.replace('.', ' ')}")
    notes.append("")
    
    total_duration = subtitles[-1]['end_ms'] - subtitles[0]['start_ms'] if subtitles else 0
    
    notes.append("## 课程概述")
    notes.append("")
    notes.append(f"- **课程主题**: {title.replace('.', ' ')}")
    notes.append(f"- **课程时长**: {format_time(total_duration)}")
    notes.append(f"- **字幕条数**: {len(subtitles)}")
    notes.append("")
    
    key_points = extract_key_points(subtitles)
    if key_points:
        notes.append("## 核心知识点速览")
        notes.append("")
        
        categories = {}
        for point in key_points:
            if point['category'] not in categories:
                categories[point['category']] = []
            categories[point['category']].append(point['content'])
        
        for category, points in categories.items():
            notes.append(f"### {category}")
            notes.append("")
            for point in points[:5]:
                notes.append(f"- {point}")
            notes.append("")
    
    topics = extract_topics(subtitles)
    
    for i, topic in enumerate(topics, 1):
        if len(topic) < 5:
            continue
            
        start_time = format_time(topic[0]['start_ms'])
        end_time = format_time(topic[-1]['end_ms'])
        
        topic_text = ' '.join(sub['text'] for sub in topic)
        
        topic_title = generate_topic_title(topic, i)
        
        notes.append(f"## {topic_title}")
        notes.append(f"**时间**: {start_time} -- {end_time}")
        notes.append("")
        
        sections = analyze_topic_content(topic)
        for section in sections:
            notes.append(f"### {section['title']}")
            notes.append("")
            notes.append(section['content'])
            notes.append("")
        
        summary = generate_detailed_summary(topic)
        notes.append("### 本节要点总结")
        notes.append("")
        for point in summary:
            notes.append(f"- {point}")
        notes.append("")
    
    final_summary = generate_final_summary(topics)
    notes.append("## 课程总结")
    notes.append("")
    notes.append(final_summary)
    notes.append("")
    
    return '\n'.join(notes)

def generate_topic_title(topic, index):
    for sub in topic[:3]:
        text = sub['text']
        if text.startswith('然后') or text.startswith('我们'):
            continue
        
        end_pos = text.find('。')
        if end_pos != -1:
            return f"{index}. {text[:end_pos+1]}"
        
        for i in range(min(25, len(text)), len(text)):
            if text[i] in ['。', '！', '？', '；', '，']:
                return f"{index}. {text[:i+1]}"
        
        return f"{index}. {text[:20]}..."
    
    return f"{index}. 讲解内容"

def analyze_topic_content(topic):
    sections = []
    topic_text = ' '.join(sub['text'] for sub in topic)
    
    if '参数' in topic_text and ('范围' in topic_text or '设置' in topic_text):
        params = extract_parameters(topic_text)
        if params:
            sections.append({
                'title': '参数说明',
                'content': format_parameters(params)
            })
    
    if any(op in topic_text for op in ['选中', '调整', '制作', '设置', '添加', '复制']):
        steps = extract_steps(topic)
        if steps:
            sections.append({
                'title': '操作步骤',
                'content': format_steps(steps)
            })
    
    if '注意' in topic_text or '问题' in topic_text:
        notes = extract_notes(topic_text)
        if notes:
            sections.append({
                'title': '注意事项',
                'content': '；'.join(notes) + '。'
            })
    
    if not sections:
        paragraphs = split_into_paragraphs(topic_text)
        sections.append({
            'title': '内容讲解',
            'content': '\n\n'.join(paragraphs)
        })
    
    return sections

def extract_parameters(text):
    params = []
    
    param_patterns = [
        r'([\u4e00-\u9fa5]+参数)[，。]',
        r'(范围是从[\u4e00-\u9fa50-9\-]+到[\u4e00-\u9fa50-9\-]+)',
        r'(默认值[\u4e00-\u9fa50-9\-]+)',
        r'(负[\u4e00-\u9fa5]+正[\u4e00-\u9fa5]+)',
    ]
    
    for pattern in param_patterns:
        matches = re.findall(pattern, text)
        params.extend(matches)
    
    return list(set(params))[:5]

def format_parameters(params):
    lines = []
    for i, param in enumerate(params, 1):
        lines.append(f"{i}. {param}")
    return '\n'.join(lines)

def extract_steps(topic):
    steps = []
    step_words = ['首先', '然后', '接下来', '最后', '第一步', '第二步', '之后']
    current_step = []
    
    for sub in topic:
        text = sub['text']
        
        if any(word in text for word in step_words):
            if current_step:
                steps.append(''.join(current_step))
            current_step = [text]
        else:
            current_step.append(text)
    
    if current_step:
        steps.append(''.join(current_step))
    
    return steps[:6]

def format_steps(steps):
    lines = []
    for i, step in enumerate(steps, 1):
        lines.append(f"{i}. {step[:100]}..." if len(step) > 100 else f"{i}. {step}")
    return '\n'.join(lines)

def extract_notes(text):
    notes = []
    note_patterns = [
        r'注意([\u4e00-\u9fa5]+)[，。]',
        r'([\u4e00-\u9fa5]+问题)[，。]',
        r'(避免[\u4e00-\u9fa5]+)[，。]',
    ]
    
    for pattern in note_patterns:
        matches = re.findall(pattern, text)
        notes.extend(matches)
    
    return list(set(notes))[:3]

def split_into_paragraphs(text, max_len=300):
    paragraphs = []
    current = ''
    sentences = re.split(r'(。|！|？|；)', text)
    
    for i, sentence in enumerate(sentences):
        if len(current) + len(sentence) <= max_len:
            current += sentence
            if i < len(sentences) - 1 and sentences[i+1] in ['。', '！', '？', '；']:
                current += sentences[i+1]
        else:
            if current:
                paragraphs.append(current.strip())
            current = sentence
    
    if current.strip():
        paragraphs.append(current.strip())
    
    return paragraphs

def generate_detailed_summary(topic):
    summary_points = []
    topic_text = ' '.join(sub['text'] for sub in topic)
    
    if '参数' in topic_text:
        summary_points.append("介绍了核心参数及其作用")
    
    if any(op in topic_text for op in ['选中', '调整', '制作', '设置']):
        summary_points.append("讲解了具体操作步骤")
    
    if '变形' in topic_text or '口型' in topic_text:
        summary_points.append("演示了变形效果和口型制作")
    
    if '镜像' in topic_text or '反转' in topic_text:
        summary_points.append("使用了镜像/反转功能提高效率")
    
    if '蒙版' in topic_text or '透明度' in topic_text:
        summary_points.append("涉及蒙版和透明度的调整")
    
    if len(topic) > 20:
        summary_points.append("内容较为详实，建议结合视频学习")
    
    return summary_points

def generate_final_summary(topics):
    all_text = ' '.join(' '.join(sub['text'] for sub in topic) for topic in topics)
    
    concepts = []
    if '参数' in all_text:
        concepts.append("参数配置")
    if '变形' in all_text:
        concepts.append("变形制作")
    if '口型' in all_text:
        concepts.append("口型设计")
    if '动画' in all_text:
        concepts.append("动画设置")
    if '物理' in all_text:
        concepts.append("物理效果")
    
    actions = []
    if '选中' in all_text:
        actions.append("选中操作")
    if '调整' in all_text:
        actions.append("参数调整")
    if '制作' in all_text:
        actions.append("模型制作")
    if '设置' in all_text:
        actions.append("功能设置")
    
    summary = f"本课程系统讲解了{', '.join(concepts)}等核心内容，" if concepts else "本课程讲解了相关内容，"
    summary += f"介绍了{', '.join(actions)}等操作方法。" if actions else ""
    summary += f"课程共分为{len(topics)}个章节，涵盖从基础概念到实际操作的完整流程，适合系统学习相关技能。"
    
    return summary

def process_srt_to_notes(srt_path, output_dir):
    filename = os.path.basename(srt_path)
    title = filename.replace('.clean.srt', '')
    
    subtitles = parse_srt(srt_path)
    notes = generate_structured_notes(subtitles, title)
    
    output_filename = filename.replace('.clean.srt', '_notes.md')
    output_path = os.path.join(output_dir, output_filename)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(notes)
    
    print(f"Generated: {output_path}")
    return output_path

def main():
    input_dir = 'j:/ai/工序管理3/srt_clean'
    output_dir = 'j:/ai/工序管理3/notes'
    
    os.makedirs(output_dir, exist_ok=True)
    
    srt_files = sorted([f for f in os.listdir(input_dir) if f.endswith('.clean.srt')])
    
    for srt_file in srt_files:
        srt_path = os.path.join(input_dir, srt_file)
        process_srt_to_notes(srt_path, output_dir)
    
    print("\n笔记生成完成！")

if __name__ == '__main__':
    main()
