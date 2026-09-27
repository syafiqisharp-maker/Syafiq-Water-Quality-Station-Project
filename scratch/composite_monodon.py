from PIL import Image, ImageFilter, ImageEnhance, ImageOps

# 1. Load the authentic high-resolution underwater seagrass photograph
bg = Image.open(r"isharp-dbms\public\assets\seagrass_sormiou_2.jpg").convert("RGBA")
bg_w, bg_h = bg.size
print(f"Background size: {bg_w}x{bg_h}")

# 2. Load the cropped tiger shrimp
shrimp_img = Image.open(r"isharp-dbms\public\assets\shrimp_crop_raw.png").convert("RGBA")
sw, sh = shrimp_img.size

# We want to isolate the shrimp or blend its patch into the seagrass.
# Since shrimp_crop_raw already has sand and seagrass, let's create a smooth oval feather mask
# around the shrimp so its edges dissolve seamlessly into the background seagrass!
mask = Image.new("L", (sw, sh), 0)
from PIL import ImageDraw
draw = ImageDraw.Draw(mask)
# Draw an ellipse encompassing the shrimp with soft feathered edges
draw.ellipse((20, 20, sw - 20, sh - 20), fill=230)
# Feather the mask heavily
mask = mask.filter(ImageFilter.GaussianBlur(18))

# Resize shrimp to fit naturally in the bottom left meadow of the 3648x2048 background
target_w = int(bg_w * 0.22) # ~800px wide
target_h = int(sh * (target_w / sw))
shrimp_resized = shrimp_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
mask_resized = mask.resize((target_w, target_h), Image.Resampling.LANCZOS)

# Color match: adjust the shrimp image slightly towards the turquoise tone of the Posidonia photo
# Seagrass sormiou is rich cyan/green
r, g, b, a = shrimp_resized.split()
# subtle color tweak
shrimp_tinted = Image.merge("RGBA", (r, g, b, mask_resized))

# Position at bottom-left among the seagrass (x: 180, y: bg_h - target_h - 100)
pos_x = int(bg_w * 0.05) # 5% from left
pos_y = int(bg_h * 0.72) # nestled into the lower seagrass blades

# Composite
bg.paste(shrimp_tinted, (pos_x, pos_y), mask_resized)

# Also let's take a sample of seagrass from the foreground of bg to overlay across the shrimp legs
# so the shrimp appears deeply camouflaged behind some blades ("just barely see")
fg_blades = bg.crop((pos_x + 50, pos_y - 80, pos_x + 350, pos_y + 120))
fg_mask = Image.new("L", fg_blades.size, 0)
fg_draw = ImageDraw.Draw(fg_mask)
fg_draw.ellipse((0, 0, fg_blades.size[0], fg_blades.size[1]), fill=120)
fg_mask = fg_mask.filter(ImageFilter.GaussianBlur(12))
bg.paste(fg_blades, (pos_x + 50, pos_y - 20), fg_mask)

# Save as the master high-res background
out_path = r"isharp-dbms\public\assets\seagrass_lagoon_monodon.jpg"
bg.convert("RGB").save(out_path, "JPEG", quality=90)
print(f"Successfully saved authentic background to {out_path}")
