"""
Generate Apex Drive app icons for Windows (.ico) and Mac (.icns via PNG).
Creates a professional-looking drive icon with the Apex "A" branding.
"""
from PIL import Image, ImageDraw, ImageFont
import struct
import io
import os

def create_icon_image(size):
    """Create an Apex Drive icon at the given size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background: rounded rectangle with gradient-like feel
    # Main color: deep blue (#1E3A5F) with accent (#3B82F6)
    margin = int(size * 0.08)
    radius = int(size * 0.18)
    
    # Draw rounded rectangle background
    bbox = [margin, margin, size - margin, size - margin]
    draw.rounded_rectangle(bbox, radius=radius, fill=(30, 58, 95, 255))
    
    # Inner highlight (slightly lighter)
    inner_margin = int(size * 0.12)
    inner_bbox = [inner_margin, inner_margin, size - inner_margin, int(size * 0.55)]
    draw.rounded_rectangle(inner_bbox, radius=int(radius * 0.8), fill=(40, 75, 120, 255))
    
    # Draw the "A" letter for Apex
    font_size = int(size * 0.45)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
    
    text = "A"
    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - int(size * 0.05)
    
    # White letter
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
    
    # Small drive icon indicator at bottom
    drive_y = int(size * 0.72)
    drive_h = int(size * 0.08)
    drive_w = int(size * 0.35)
    drive_x = (size - drive_w) // 2
    drive_bbox = [drive_x, drive_y, drive_x + drive_w, drive_y + drive_h]
    draw.rounded_rectangle(drive_bbox, radius=int(drive_h * 0.3), fill=(59, 130, 246, 255))
    
    # Small dot on the drive indicator
    dot_r = int(drive_h * 0.25)
    dot_x = drive_x + drive_w - int(drive_h * 0.8)
    dot_y = drive_y + drive_h // 2
    draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=(255, 255, 255, 200))
    
    return img

def create_ico(output_path):
    """Create a Windows .ico file with multiple sizes."""
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = []
    
    for s in sizes:
        img = create_icon_image(s)
        images.append(img)
    
    # Save as ICO
    # The largest image is saved first, then ico format handles the rest
    images[-1].save(output_path, format='ICO', sizes=[(s, s) for s in sizes])
    print(f"Created Windows icon: {output_path}")

def create_png_set(output_dir):
    """Create PNG icons for Mac/Linux."""
    sizes = {
        'icon.png': 512,
        '256x256.png': 256,
        '128x128.png': 128,
        '64x64.png': 64,
        '48x48.png': 48,
        '32x32.png': 32,
        '16x16.png': 16,
    }
    
    os.makedirs(output_dir, exist_ok=True)
    
    for filename, size in sizes.items():
        img = create_icon_image(size)
        path = os.path.join(output_dir, filename)
        img.save(path, format='PNG')
        print(f"Created PNG: {path} ({size}x{size})")
    
    # Also save a 512x512 as the main icon.png in build/
    return os.path.join(output_dir, 'icon.png')

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Create Windows .ico
    ico_path = os.path.join(script_dir, 'icon.ico')
    create_ico(ico_path)
    
    # Create PNG set for electron-builder (it can generate .icns from PNGs)
    icons_dir = os.path.join(script_dir, 'icons')
    main_png = create_png_set(icons_dir)
    
    # Also copy the 512x512 PNG to build/icon.png (electron-builder uses this)
    import shutil
    icon_png_path = os.path.join(script_dir, 'icon.png')
    shutil.copy2(main_png, icon_png_path)
    print(f"\nMain icon copied to: {icon_png_path}")
    
    print("\nAll icons generated successfully!")
    print(f"  Windows: {ico_path}")
    print(f"  PNG set: {icons_dir}/")
    print(f"  Main:    {icon_png_path}")
