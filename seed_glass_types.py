"""
Seed the glass_types table with 37 stained glass types from Glassified Studio's
visual guide:  https://www.glassified-studio.com/post/a-visual-guide-to-glass-...

Each type gets a representative thumbnail URL (hosted on wixstatic) and a short
description.  Run with:

    python seed_glass_types.py
"""
import sys
import os

# Allow running from project root
sys.path.insert(0, os.path.dirname(__file__))

from backend.app import create_app
from backend.models import db, GlassType

_WIX = "https://static.wixstatic.com/media"

GLASS_TYPES = [
    {
        "name": "Mottled",
        "description": "Features irregular blends of two or more colors, creating a mottled, multi-toned appearance. Semi-transparent with color variation throughout.",
        "texture_url": f"{_WIX}/a06292_939e5c1c3a0d4be3906f94ce741b3fdd~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_939e5c1c3a0d4be3906f94ce741b3fdd~mv2.webp",
    },
    {
        "name": "Stipple",
        "description": "Has a subtly bumpy, textured surface that diffuses light. Creates a soft, frosted look while still allowing light through.",
        "texture_url": f"{_WIX}/a06292_70312f89fda94408a4b2655dd14fcf2a~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_70312f89fda94408a4b2655dd14fcf2a~mv2.webp",
    },
    {
        "name": "Fracture Streamer",
        "description": "Contains thin shards (fractures) and ribbon-like streamers of contrasting glass embedded in a base color. Very dynamic, textured look.",
        "texture_url": f"{_WIX}/a06292_90a81a63d8584c8394218520c6d2c079~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_90a81a63d8584c8394218520c6d2c079~mv2.webp",
    },
    {
        "name": "Streamer",
        "description": "Similar to fracture streamer but without the shards — smooth ribbons of contrasting color swirl through the base glass.",
        "texture_url": f"{_WIX}/a06292_e08513cfd2d24289b051b129dfe84d02~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_e08513cfd2d24289b051b129dfe84d02~mv2.webp",
    },
    {
        "name": "Mardi Gras",
        "description": "A festive, multi-colored glass with confetti-like flecks of various colors. Bold and celebratory in appearance.",
        "texture_url": f"{_WIX}/a06292_9a3317a7198d43df982b6d1d8e19a279~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_9a3317a7198d43df982b6d1d8e19a279~mv2.webp",
    },
    {
        "name": "Flemish",
        "description": "A clear textured glass with a diamond or flower-like repeated pattern. Distorts images while still transmitting light well.",
        "texture_url": f"{_WIX}/a06292_96643f42f7094397b96be9b921ef080e~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_96643f42f7094397b96be9b921ef080e~mv2.webp",
    },
    {
        "name": "Seedy",
        "description": "Contains small air bubbles (seeds) trapped in the glass, giving it a vintage, antique look. Available in clear and colored versions.",
        "texture_url": f"{_WIX}/a06292_c95512f1c92d41f7b5b191b23e4803b1~mv2.jpg",
    },
    {
        "name": "Ribbed Satin Seedy",
        "description": "Combines ribbed texture with a satin finish and tiny seed bubbles. Very diffused light transmission with a soft, elegant look.",
        "texture_url": f"{_WIX}/a06292_565bb48ae44246faba8661aa71fe1959~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_565bb48ae44246faba8661aa71fe1959~mv2.webp",
    },
    {
        "name": "Glue Chip",
        "description": "Created by applying hot hide glue to sandblasted glass, producing fern-like frost patterns. Each sheet is unique. Clear and colored versions available.",
        "texture_url": f"{_WIX}/a06292_65e4d11e96b940d8a2fd3ca70e1a1250~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_65e4d11e96b940d8a2fd3ca70e1a1250~mv2.webp",
    },
    {
        "name": "Sycamore",
        "description": "A clear textured glass with a leaf-vein pattern resembling sycamore tree bark. Good light transmission with interesting surface detail.",
        "texture_url": f"{_WIX}/a06292_bcea6024c2cb409b9714e8f0d7249ba7~mv2.jpg",
    },
    {
        "name": "Konfeta",
        "description": "Features colorful confetti-like chips embedded in clear or colored glass. Playful and decorative.",
        "texture_url": f"{_WIX}/a06292_00a6f8f75f02427a9342a1b17455b2d5~mv2.jpg",
    },
    {
        "name": "Ribbed",
        "description": "Has parallel ridges running across the surface. Creates linear light diffusion and a clean, architectural look.",
        "texture_url": f"{_WIX}/a06292_5d79aa44b20e4ff7981c531b98abfd60~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_5d79aa44b20e4ff7981c531b98abfd60~mv2.webp",
    },
    {
        "name": "Cord",
        "description": "Has thin, rope-like ridges resembling cords running through the glass. Creates subtle linear texture and light distortion.",
        "texture_url": f"{_WIX}/a06292_53c13ed9b1fe4540b21c231659a75e2e~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_53c13ed9b1fe4540b21c231659a75e2e~mv2.webp",
    },
    {
        "name": "Rough Rolled",
        "description": "Machine-rolled glass with a slightly rough, uneven surface. Semi-transparent with a handmade, organic feel.",
        "texture_url": f"{_WIX}/a06292_fd9ff6aacbc347fcac69edf550fb827e~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_fd9ff6aacbc347fcac69edf550fb827e~mv2.webp",
    },
    {
        "name": "Rolled Granite",
        "description": "Rolled glass with a granite-like speckled surface. Opaque to semi-transparent with stone-like appearance.",
        "texture_url": f"{_WIX}/a06292_6190ea1e6cce4a4888700eff771c1ef3~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_6190ea1e6cce4a4888700eff771c1ef3~mv2.webp",
    },
    {
        "name": "Checkerboard",
        "description": "Clear glass with a small checkerboard or square grid pattern pressed into the surface. Geometric and ordered.",
        "texture_url": f"{_WIX}/a06292_f0cd6ad69ab24aab95d9cf7274da6a85~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_f0cd6ad69ab24aab95d9cf7274da6a85~mv2.webp",
    },
    {
        "name": "Krinkle",
        "description": "Has a crinkled, wrinkled surface texture that scatters light in multiple directions. Creates a sparkling, lively effect.",
        "texture_url": f"{_WIX}/a06292_08238710cd7a4085b56d323d60f602c9~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_08238710cd7a4085b56d323d60f602c9~mv2.webp",
    },
    {
        "name": "Sparkle",
        "description": "Clear glass with embedded sparkling elements that catch and reflect light. Adds a shimmering, glittery quality.",
        "texture_url": f"{_WIX}/a06292_7b9be33eee264c1a993fd80f87eedd25~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_7b9be33eee264c1a993fd80f87eedd25~mv2.webp",
    },
    {
        "name": "Tapestry",
        "description": "Has a woven, fabric-like texture pressed into the surface. Creates a soft, warm light diffusion reminiscent of cloth.",
        "texture_url": f"{_WIX}/a06292_f7a323f9a0bc46d4b72c40c740bdc48e~mv2.jpg",
    },
    {
        "name": "Vertigo",
        "description": "Features swirling, wave-like patterns that create a sense of movement and depth. Very dynamic with excellent light play.",
        "texture_url": f"{_WIX}/a06292_71c9d587224747aa931776c3228ffe59~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_71c9d587224747aa931776c3228ffe59~mv2.webp",
    },
    {
        "name": "Artique",
        "description": "Has a soft, slightly wavy texture with subtle variations. Resembles hand-blown antique glass with gentle distortion.",
        "texture_url": f"{_WIX}/a06292_a78ec118fdd842eab1b31f2d86ec944b~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_a78ec118fdd842eab1b31f2d86ec944b~mv2.webp",
    },
    {
        "name": "Everglade",
        "description": "Named after the Everglades, this glass has an organic, flowing texture reminiscent of water and natural landscapes.",
        "texture_url": f"{_WIX}/a06292_93cb06c3a6a54dcf827eb43d80a22fa5~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_93cb06c3a6a54dcf827eb43d80a22fa5~mv2.webp",
    },
    {
        "name": "Autumn",
        "description": "Features a leaf-like, organic texture pattern. Creates warm, natural-looking light diffusion.",
        "texture_url": f"{_WIX}/a06292_4a40d748e2104c658d6bd8e6ae3ff11c~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_4a40d748e2104c658d6bd8e6ae3ff11c~mv2.webp",
    },
    {
        "name": "Mississippi",
        "description": "Exclusive to Kokomo Opalescent Glass. A unique, irregular texture with a river-like flowing quality.",
        "texture_url": f"{_WIX}/a06292_3d189d5edb3547daa9d54f1e43e50b01~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_3d189d5edb3547daa9d54f1e43e50b01~mv2.webp",
    },
    {
        "name": "Hammered",
        "description": "Surface looks like it's been struck with a hammer, creating small, irregular indentations. Excellent light diffusion.",
        "texture_url": f"{_WIX}/a06292_61020e431e7e486299fc10d0fb0cee90~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_61020e431e7e486299fc10d0fb0cee90~mv2.webp",
    },
    {
        "name": "Small Hammered",
        "description": "Similar to hammered but with finer, more closely spaced indentations. More subtle texture with good privacy.",
        "texture_url": f"{_WIX}/a06292_e7e8370b9d7d425f8399095aaf706c7d~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_e7e8370b9d7d425f8399095aaf706c7d~mv2.webp",
    },
    {
        "name": "Granite",
        "description": "Has a grainy, stone-like appearance. Opaque to semi-transparent with a natural, earthy aesthetic.",
        "texture_url": f"{_WIX}/a06292_bc4bdee325294cc681a680b400aa48e9~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_bc4bdee325294cc681a680b400aa48e9~mv2.webp",
    },
    {
        "name": "Corteza",
        "description": "Spanish for 'bark' — has a tree bark-like texture. Rich, organic surface pattern with moderate light diffusion.",
        "texture_url": f"{_WIX}/a06292_bcc9ffa9777342ae92670270f40b477e~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_bcc9ffa9777342ae92670270f40b477e~mv2.webp",
    },
    {
        "name": "Rain Water",
        "description": "Mimics the look of rain running down a window pane. Elongated drip-like texture creates a beautiful water effect.",
        "texture_url": f"{_WIX}/a06292_abc3b6c71c0a4fe1aecd2ace3d10b544~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_abc3b6c71c0a4fe1aecd2ace3d10b544~mv2.webp",
    },
    {
        "name": "Reamy / Baroque",
        "description": "Has dramatic, thick waves and ripples. Creates strong visual distortion and movement. Very popular for decorative panels.",
        "texture_url": f"{_WIX}/a06292_646e8b49eb75408c9f3ef53b46a0a5da~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_646e8b49eb75408c9f3ef53b46a0a5da~mv2.webp",
    },
    {
        "name": "Cotswold",
        "description": "Named after the Cotswolds region. Has a gentle, open diamond-like texture that softly diffuses light.",
        "texture_url": f"{_WIX}/a06292_f70ff635a68c4593acd92147dbfbe515~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_f70ff635a68c4593acd92147dbfbe515~mv2.webp",
    },
    {
        "name": "Crackle",
        "description": "Has a crackled, shattered-ice appearance. Each piece is unique with fine crack patterns throughout.",
        "texture_url": f"{_WIX}/a06292_6e4ae9b9a1ec475784292d82f1fec267~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_6e4ae9b9a1ec475784292d82f1fec267~mv2.webp",
    },
    {
        "name": "Waterglass",
        "description": "Exclusive to Oceanside Glass & Tile. Has a flowing, water-surface texture with gentle waves. Beautiful natural light play.",
        "texture_url": f"{_WIX}/a06292_de96e91e69fb450890cec5fda8ba5d89~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_de96e91e69fb450890cec5fda8ba5d89~mv2.webp",
    },
    {
        "name": "Reed",
        "description": "Has fine, closely spaced parallel ridges resembling reeds. Creates strong directional diffusion and a clean line effect.",
        "texture_url": f"{_WIX}/a06292_3af01b6e29be4f7fae3b5843a0972c42~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_3af01b6e29be4f7fae3b5843a0972c42~mv2.webp",
    },
    {
        "name": "Wavolite",
        "description": "Exclusive to Kokomo. Has a wave-like rippled texture that creates flowing patterns in light.",
        "texture_url": f"{_WIX}/a06292_0a3515a2aa12440094035baa004aefd6~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_0a3515a2aa12440094035baa004aefd6~mv2.webp",
    },
    {
        "name": "Van Gogh",
        "description": "Named after the painter. Features bold, swirling color patterns reminiscent of Van Gogh's brushstrokes. Very artistic and expressive.",
        "texture_url": f"{_WIX}/a06292_57b9e9e369134f8a8de2ca9a62c9ff24~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_57b9e9e369134f8a8de2ca9a62c9ff24~mv2.webp",
    },
    {
        "name": "English Muffle",
        "description": "Has a soft, muffled texture produced by pressing the hot glass between rollers. Elegant, understated look with gentle patterns.",
        "texture_url": f"{_WIX}/a06292_95076eb3a3f7448ba8d1298b2ecbbbb3~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_95076eb3a3f7448ba8d1298b2ecbbbb3~mv2.webp",
    },
    {
        "name": "MLW Mirror",
        "description": "Mirrored glass used as an accent in stained glass work. Provides reflective surfaces for dramatic effect.",
        "texture_url": f"{_WIX}/a06292_df87088e89124a408b66da086cf6090a~mv2.jpg/v1/fill/w_243,h_243,fp_0.50_0.50,q_90/a06292_df87088e89124a408b66da086cf6090a~mv2.webp",
    },
]


def seed():
    app = create_app()
    with app.app_context():
        existing = GlassType.query.count()
        if existing > 0:
            print(f"Glass types table already has {existing} rows — skipping seed.")
            print("To re-seed, delete existing rows first:  DELETE FROM glass_types;")
            return

        for idx, gt in enumerate(GLASS_TYPES):
            glass_type = GlassType(
                name=gt["name"],
                description=gt["description"],
                texture_url=gt["texture_url"],
                is_active=True,
                display_order=idx,
            )
            db.session.add(glass_type)

        db.session.commit()
        print(f"Seeded {len(GLASS_TYPES)} glass types successfully.")


if __name__ == "__main__":
    seed()
