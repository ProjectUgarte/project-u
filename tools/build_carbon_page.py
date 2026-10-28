#!/usr/bin/env python3
"""Generate SpeedBreaker: Carbon's page from SpeedBreaker's.

    python3 tools/build_carbon_page.py          # writes speedbreaker/carbon/index.html
    python3 tools/build_carbon_page.py --check  # exits 1 if that file is out of date

Both games live on one page (2026-10-26): speedbreaker/index.html holds Most
Wanted and Carbon, and js/speedbreaker.js switches between them in place.
Carbon still needs an address of its own, /speedbreaker/carbon/, so direct
links, visitors without script, search engines and link previews get Carbon
first. This script makes that page from the same source, changing only what
makes it Carbon's:

  - <html data-game="carbon">: the game shown (the CSS shows Carbon's copy,
    data-only="carbon", from the start);
  - the head between <!-- game-head --> and <!-- /game-head -->: title,
    description, canonical, Open Graph and Twitter tags, social image;
  - the hero preloads between <!-- game-preload --> markers: Carbon's still is
    this page's LCP image;
  - the hero's roles: Carbon's layer is the one shown (.is-base, reachable,
    its picture at full size and high priority), Most Wanted's waits in the
    corner (.is-blade, inert, its picture small and low priority until the
    script fetches it in full);
  - the blade's link: to /speedbreaker/, labelled Most Wanted.

Every path in the source is root-relative (/assets/..., /css/...), so nothing
else changes when the page moves a folder down. Each swap must match exactly
once; if the source has moved under it, the script stops instead of writing a
half-Carbon page. Edit speedbreaker/index.html, never the generated file.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "speedbreaker" / "index.html"
OUT = ROOT / "speedbreaker" / "carbon" / "index.html"

IMG = "/assets/images/speedbreaker/"
SITE = "https://projectugarte.com"

# Carbon's head. Facts from the Carbon README draft and release notes
# (carbon/launch/docs/README.md, release/RELEASE-NOTES.prefill.md).
# The social image is Carbon's key art (the operator's pick for the hero,
# 2026-10-26, until his gameplay recording replaces it), cut to 1200x630 from
# release/art/carbon-cliff-source.webp, like MW's sb-hero-chase-cam-social.jpg.
CARBON_HEAD = f"""<!-- game-head: Carbon's, from tools/build_carbon_page.py -->
  <title>SpeedBreaker: Carbon — project(u)</title>
  <meta name="description" content="SpeedBreaker: Carbon: the definitive Need for Speed: Carbon recompilation, built from the 2006 Xbox 360 version by static recompilation. Native on Steam Deck, Steam Machine, Steam Frame, Linux and Mac, from your own disc of the USA Collector's Edition. On iPhone and iPad, sideload the experimental IPA or build it yourself. Free and unofficial. No game files included. Not affiliated with EA or Valve.">

  <!-- Social preview: Need for Speed: Carbon's key art (EA's, credited on the Legal page) until gameplay footage replaces it. No logos. -->
  <meta property="og:type" content="website">
  <link rel="canonical" href="{SITE}/speedbreaker/carbon/">
  <meta property="og:url" content="{SITE}/speedbreaker/carbon/">
  <meta property="og:title" content="SpeedBreaker: Carbon — The 2006 Xbox 360 racer, native on Steam Deck, Steam Machine, Steam Frame and Mac">
  <meta property="og:description" content="The definitive Need for Speed: Carbon recompilation, built from the 2006 Xbox 360 version, out on its 20th anniversary. Sharper and wider on Steam Deck, Steam Machine, Steam Frame, Linux and Mac, from your own disc. Free and unofficial. No game files included. Not affiliated with EA or Valve.">
  <meta property="og:image" content="{SITE}{IMG}sb-carbon-hero-social.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Need for Speed: Carbon key art: a black sports car at the edge of a cliff at night, above the lights of a city">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="SpeedBreaker: Carbon — An Unofficial Native Port">
  <meta name="twitter:description" content="The definitive Need for Speed: Carbon recompilation, built from the 2006 Xbox 360 version. Steam Deck, Steam Machine, Steam Frame, Linux and Mac, from your own disc. No game files included. Not affiliated with EA or Valve.">
  <meta name="twitter:image" content="{SITE}{IMG}sb-carbon-hero-social.jpg">
  <!-- /game-head -->"""

# The same two preloads as Most Wanted's (see the comment above them in the
# source), for Carbon's still (its v2 video loop's poster, frame 444; the img in the
# source's Carbon layer must name the same files, or the preload is wasted).
CARBON_PRELOAD = f"""<!-- game-preload: Carbon's, from tools/build_carbon_page.py -->
  <link rel="preload" as="image" media="(orientation: portrait), (max-width: 600px)"
        href="{IMG}sbc-hero-v2-poster-portrait-720.jpg"
        fetchpriority="high">
  <link rel="preload" as="image" media="(orientation: landscape) and (min-width: 600.02px)"
        imagesrcset="{IMG}sbc-hero-v2-poster-21x9-sb-1280.jpg 1280w, {IMG}sbc-hero-v2-poster-21x9-sb-2400.jpg 2400w"
        imagesizes="(min-aspect-ratio: 12/5) 100vw, calc((100vh - 72px) * 2.335)"
        fetchpriority="high">
  <!-- /game-preload -->"""

BANNER = """<!-- GENERATED by tools/build_carbon_page.py from speedbreaker/index.html: SpeedBreaker: Carbon's
     own address (/speedbreaker/carbon/). Don't edit this file; edit the source and run the script. -->
"""


class Moved(Exception):
    pass


def once(text, old, new, what):
    n = text.count(old)
    if n != 1:
        raise Moved(f"{what}: expected 1 match, found {n}: {old[:90]!r}")
    return text.replace(old, new)


def block(text, name, new):
    """Replace <!-- name --> ... <!-- /name --> (both markers included)."""
    pat = re.compile(r"<!-- %s -->.*?<!-- /%s -->" % (name, name), re.S)
    found = pat.findall(text)
    if len(found) != 1:
        raise Moved(f"{name}: expected one marked block, found {len(found)}")
    return pat.sub(lambda m: new, text)


def edit_layer(text, game, fn):
    pat = re.compile(r"(<!-- layer:%s -->)(.*?)(<!-- /layer:%s -->)" % (game, game), re.S)
    m = pat.search(text)
    if not m or len(pat.findall(text)) != 1:
        raise Moved(f"layer:{game}: expected one marked layer")
    return text[: m.start(2)] + fn(m.group(2)) + text[m.end(2):]


def build(src):
    t = src
    t = once(t, "<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + BANNER, "doctype")
    t = once(t, '<html lang="en" data-game="mw">', '<html lang="en" data-game="carbon">', "html")
    t = block(t, "game-head", CARBON_HEAD)
    t = block(t, "game-preload", CARBON_PRELOAD)
    t = once(t, '<header class="sb-hero" id="sb-hero" data-blade="carbon">',
             '<header class="sb-hero" id="sb-hero" data-blade="mw">', "hero")

    def mw_to_blade(s):
        s = once(s, 'sb-hero__layer--mw is-base" data-game-layer="mw">',
                 'sb-hero__layer--mw is-blade" data-game-layer="mw" inert aria-hidden="true">', "MW layer")
        s, n = re.subn(r'(<img [^>]*?) sizes="([^"]+)"', r'\1 sizes="400px" data-sizes="\2"', s)
        if n != 1:
            raise Moved(f"MW layer: expected one <img sizes>, found {n}")
        return once(s, 'fetchpriority="high"', 'fetchpriority="low"', "MW priority")

    def carbon_to_base(s):
        s = once(s, 'sb-hero__layer--carbon is-blade" data-game-layer="carbon" inert aria-hidden="true">',
                 'sb-hero__layer--carbon is-base" data-game-layer="carbon">', "Carbon layer")
        s, n = re.subn(r' sizes="400px" data-sizes="([^"]+)"', r' sizes="\1"', s)
        if n != 1:
            raise Moved(f"Carbon layer: expected one small <img sizes>, found {n}")
        return once(s, 'fetchpriority="low"', 'fetchpriority="high"', "Carbon priority")

    t = edit_layer(t, "mw", mw_to_blade)
    t = edit_layer(t, "carbon", carbon_to_base)
    t = once(t, 'href="/speedbreaker/carbon/" aria-label="Switch to SpeedBreaker: Carbon">',
             'href="/speedbreaker/" aria-label="Switch to SpeedBreaker">', "blade link")
    t = once(t, '<span class="sb-blade__name">SpeedBreaker:\nCarbon</span>',
             '<span class="sb-blade__name">SpeedBreaker</span>', "blade label")
    return t


def main():
    try:
        out = build(SRC.read_text(encoding="utf-8"))
    except Moved as e:
        sys.exit(f"build_carbon_page: the source has moved under a swap ({e}); nothing written.")
    if "--check" in sys.argv[1:]:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != out:
            sys.exit("build_carbon_page: speedbreaker/carbon/index.html is out of date; run tools/build_carbon_page.py")
        print("speedbreaker/carbon/index.html is up to date")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
