# Content guide

Everything about your projects lives in two places:

- `content_map.json`: which project shows on which hoarding / banner (frame) in the 3D world.
- `content/projects/<slug>/`: one folder per project with a `project.json` and its images.

After changing anything, commit and push. Netlify rebuilds the site in a minute or two.

---

## 1. Add images to a project

1. Put the files in the project's folder, e.g. `content/projects/ispl/`.
   JPG, PNG, WebP or AVIF all work. Keep them under ~400 KB each for fast loading (export at ~2000 px wide, quality 75–80).
2. List them in that folder's `project.json`:

```json
{
  "title": "ISPL",
  "category": "Events & branding",
  "year": "2024",
  "client": "Indian Street Premier League",
  "role": "Associate creative director",
  "description": "Two or three sentences about the project.",
  "cover": "cover.jpg",
  "images": ["scoreboard.jpg", "boundary.jpg", "stadium.jpg"],
  "caseStudy": "ispl-case-study.pdf"
}
```

| Field | What it does |
| --- | --- |
| `cover` | Shown on the project's main (hero) hoarding in the world, at the top of the project page, and on the `/work` grid. If empty, the first image is used. |
| `images` | The gallery on the project page. Image 2, 3, … also appear on the project's extra frames in the world (in the order the frames are listed in `content_map.json`). |
| `caseStudy` | Optional. Shows a **Read case study** button. Use one of: a PDF file name (`"case.pdf"`), one long JPEG (`"case.jpg"`), several pages in order (`["page-1.jpg", "page-2.jpg"]`), or a link (`"https://www.behance.net/..."`). Leave `""` for none. |
| `year`, `client`, `role` | Optional details shown next to the description. Empty ones are hidden. |

Until real images are added, the site draws a coloured placeholder poster with the project name.
Replace the `PLACEHOLDER:` descriptions with your own text.

**Frame shapes:** each frame has a fixed shape (its `aspect` in Blender, width ÷ height). Images are cropped to fill the frame, centred.
Wide banners like shop signs (≈ 4:1) and LED boards (≈ 12:1) crop a lot, so give those frames a purpose-made wide image
(add it to `images` in the right position) rather than a photo.

## 2. Add a new project

1. Create a folder `content/projects/<slug>/` (lowercase, dashes, e.g. `bisleri-summer`), with a `project.json` like the one above and its images.
2. Add an entry to `projects` in `content_map.json`:

```json
{ "slug": "bisleri-summer", "title": "Bisleri Summer", "category": "Packaging", "zone": "bazaar",
  "hero": "bazaar/shop-sign-02", "frames": ["bazaar/shopfront-02"] }
```

3. Remove the frames you used from the `spare` list.

The project gets its own page at `/work/bisleri-summer` and appears on `/work` under its category.
Categories on `/work` are grouped as **Events & branding**, **Packaging** and **Branding** (a category like "Branding & packaging" goes under Branding).

## 3. Move a project to a different (spare) frame

In `content_map.json`, change the project's `hero` (or one of its `frames`) to the spare frame id, and move the old id into `spare`.
Frame ids are `zone/id`, matching the Blender objects `slot_<zone>__<id>`. Spare frames show "Coming soon".

Spare frames right now: see the `spare` list in `content_map.json`.

## 4. New frames from Blender

Add a mesh named `slot_<zone>__<id>` with custom properties `slot_id` (`"<zone>/<id>"`) and `aspect`, with UVs 0–1, and re-export `public/models/world.glb`.
It shows up automatically as "Coming soon" until you assign it to a project in `content_map.json`.
