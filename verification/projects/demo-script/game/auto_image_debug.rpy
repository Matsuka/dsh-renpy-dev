init python:
    import renpy.display.image as _img
    print("=== AUTOIMAGE-DEBUG all keys ===")
    for k in sorted(_img.images.keys(), key=str):
        print("   ", k, "->", type(_img.images[k]).__name__)
