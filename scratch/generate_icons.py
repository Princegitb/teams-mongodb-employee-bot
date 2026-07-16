import zlib
import struct
import os

def create_png_file(filepath, width, height, is_outline=False):
    # Create pixel data
    # Color: Indigo (#63, #66, #F1, 255)
    # Outline: transparent background, white icon.
    pixels = []
    for y in range(height):
        for x in range(width):
            # Center of the image
            cx, cy = width / 2.0, height / 2.0
            dist_sq = (x - cx) ** 2 + (y - cy) ** 2
            radius = min(width, height) * 0.4
            
            if is_outline:
                # White outline of a circle/square in the center with transparency
                # Inner radius to outer radius
                in_rad = radius * 0.7
                out_rad = radius
                if in_rad * in_rad <= dist_sq <= out_rad * out_rad:
                    # White pixel
                    pixels.append((255, 255, 255, 255))
                else:
                    # Transparent pixel
                    pixels.append((0, 0, 0, 0))
            else:
                # Color icon: Solid Indigo background, with a white circle/square in the center
                if dist_sq <= radius * radius:
                    # White color
                    pixels.append((255, 255, 255, 255))
                else:
                    # Indigo background (#6366F1)
                    pixels.append((99, 102, 241, 255))

    # PNG signature
    png = bytearray([137, 80, 78, 71, 13, 10, 26, 10])
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    
    # IDAT chunk
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type 0
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw_data.extend([r, g, b, a])
            
    idat_data = zlib.compress(raw_data)
    png += struct.pack('>I', len(idat_data)) + b'IDAT' + idat_data + struct.pack('>I', zlib.crc32(b'IDAT' + idat_data))
    
    # IEND chunk
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    
    with open(filepath, 'wb') as f:
        f.write(png)
    print(f"Generated {filepath} successfully (size: {len(png)} bytes).")

if __name__ == '__main__':
    target_dir = r"c:\Users\HP\OneDrive\Desktop\Intern_DIxon\teams-mongodb-bot\appPackage"
    color_path = os.path.join(target_dir, "color.png")
    outline_path = os.path.join(target_dir, "outline.png")
    
    create_png_file(color_path, 192, 192, is_outline=False)
    create_png_file(outline_path, 32, 32, is_outline=True)
