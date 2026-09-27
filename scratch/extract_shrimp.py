from PIL import Image, ImageFilter, ImageEnhance

# Load the mockup that has the beautiful tiger shrimp
mockup = Image.open(r"C:\Users\syafiq\.gemini\antigravity-ide\brain\db223d9f-25c8-4806-9602-97830b350ad0\monodon_concept_1_1790482448892.jpg")
w, h = mockup.size
print("Mockup size:", w, h)

# In monodon_concept_1, the shrimp is at the bottom right
# Let's crop the shrimp region: x around 1100 to 1850, y around 650 to 950
shrimp_crop = mockup.crop((int(w * 0.60), int(h * 0.65), int(w * 0.98), int(h * 0.95)))
shrimp_crop.save(r"isharp-dbms\public\assets\shrimp_crop_raw.png")
print("Saved raw shrimp crop:", shrimp_crop.size)
