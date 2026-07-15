"""
YOUCHOOSE — search_queries.py
==============================
India-focused dynamic search query bank for autonomous scraping.

Contains 120+ hyper-specific search terms organized by city, cuisine,
and food category. The daemon picks the next unused query each cycle
and marks it as used. After all queries are exhausted (~30-60 days),
the system loops back to re-scrape for newly uploaded videos.
"""

# ── MASTER QUERY BANK ─────────────────────────────────────────
# Each tuple: (query_text, region, category)

INDIA_QUERIES = [
    # ── MUMBAI ────────────────────────────────────────────────
    ("best street food in mumbai", "mumbai", "street_food"),
    ("street food in fort area mumbai", "mumbai", "street_food"),
    ("best vada pav in mumbai review", "mumbai", "street_food"),
    ("mumbai fine dining restaurant review", "mumbai", "fine_dining"),
    ("best restaurants in bandra mumbai", "mumbai", "restaurant"),
    ("hidden food gems in colaba mumbai", "mumbai", "hidden_gem"),
    ("best biryani in mumbai food review", "mumbai", "cuisine"),
    ("juhu beach street food review", "mumbai", "street_food"),
    ("best cafes in mumbai review 2024", "mumbai", "cafe"),
    ("andheri food walk mumbai", "mumbai", "food_walk"),
    ("lower parel restaurants review mumbai", "mumbai", "restaurant"),
    ("best pav bhaji in mumbai", "mumbai", "street_food"),
    ("south mumbai restaurant review", "mumbai", "restaurant"),
    ("best seafood in mumbai review", "mumbai", "cuisine"),
    ("irani cafe mumbai review", "mumbai", "cafe"),

    # ── DELHI / NCR ───────────────────────────────────────────
    ("best street food in old delhi", "delhi", "street_food"),
    ("chandni chowk food walk delhi", "delhi", "food_walk"),
    ("best restaurants in connaught place delhi", "delhi", "restaurant"),
    ("delhi fine dining restaurant review", "delhi", "fine_dining"),
    ("best butter chicken in delhi review", "delhi", "cuisine"),
    ("best chole bhature in delhi", "delhi", "street_food"),
    ("hauz khas village food review delhi", "delhi", "restaurant"),
    ("best kebabs in old delhi review", "delhi", "cuisine"),
    ("south delhi cafe review", "delhi", "cafe"),
    ("best momos in delhi food review", "delhi", "street_food"),
    ("gurgaon restaurant review", "delhi", "restaurant"),
    ("noida food review best restaurants", "delhi", "restaurant"),
    ("best paratha in delhi review", "delhi", "street_food"),
    ("delhi food blogger honest review", "delhi", "general"),
    ("best dhabas near delhi review", "delhi", "dhaba"),

    # ── BANGALORE ─────────────────────────────────────────────
    ("best restaurants in bangalore review", "bangalore", "restaurant"),
    ("bangalore street food review", "bangalore", "street_food"),
    ("koramangala food review bangalore", "bangalore", "restaurant"),
    ("best dosa in bangalore review", "bangalore", "cuisine"),
    ("indiranagar restaurants review bangalore", "bangalore", "restaurant"),
    ("best biryani in bangalore food review", "bangalore", "cuisine"),
    ("bangalore cafe review 2024", "bangalore", "cafe"),
    ("best filter coffee bangalore review", "bangalore", "cafe"),
    ("whitefield food review bangalore", "bangalore", "restaurant"),
    ("bangalore fine dining review", "bangalore", "fine_dining"),
    ("vv puram food street bangalore review", "bangalore", "food_walk"),
    ("best craft beer pubs bangalore review", "bangalore", "bar"),

    # ── PUNE ──────────────────────────────────────────────────
    ("best restaurants in pune review", "pune", "restaurant"),
    ("pune street food review", "pune", "street_food"),
    ("best misal pav in pune review", "pune", "cuisine"),
    ("fc road food review pune", "pune", "food_walk"),
    ("pune cafe review 2024", "pune", "cafe"),
    ("koregaon park restaurants review pune", "pune", "restaurant"),
    ("best vada pav in pune review", "pune", "street_food"),
    ("pune fine dining review", "pune", "fine_dining"),

    # ── HYDERABAD ─────────────────────────────────────────────
    ("best biryani in hyderabad review", "hyderabad", "cuisine"),
    ("hyderabad street food review", "hyderabad", "street_food"),
    ("best restaurants in hyderabad review", "hyderabad", "restaurant"),
    ("hyderabad old city food walk", "hyderabad", "food_walk"),
    ("best haleem in hyderabad review", "hyderabad", "cuisine"),
    ("banjara hills restaurants review hyderabad", "hyderabad", "restaurant"),
    ("hyderabad irani chai review", "hyderabad", "cafe"),
    ("best dosa in hyderabad review", "hyderabad", "cuisine"),

    # ── CHENNAI ───────────────────────────────────────────────
    ("best restaurants in chennai review", "chennai", "restaurant"),
    ("chennai street food review", "chennai", "street_food"),
    ("best filter coffee in chennai review", "chennai", "cafe"),
    ("marina beach food review chennai", "chennai", "street_food"),
    ("best biryani in chennai review", "chennai", "cuisine"),
    ("t nagar food review chennai", "chennai", "food_walk"),
    ("best chettinad food chennai review", "chennai", "cuisine"),

    # ── KOLKATA ───────────────────────────────────────────────
    ("best street food in kolkata review", "kolkata", "street_food"),
    ("kolkata food review 2024", "kolkata", "general"),
    ("best rolls in kolkata review", "kolkata", "street_food"),
    ("best mishti doi in kolkata review", "kolkata", "cuisine"),
    ("park street restaurants review kolkata", "kolkata", "restaurant"),
    ("best biryani in kolkata review", "kolkata", "cuisine"),
    ("kolkata chinese food review tiretti bazaar", "kolkata", "food_walk"),

    # ── GOA ───────────────────────────────────────────────────
    ("best restaurants in goa review", "goa", "restaurant"),
    ("goa beach shack food review", "goa", "restaurant"),
    ("north goa cafe review", "goa", "cafe"),
    ("best seafood in goa review", "goa", "cuisine"),
    ("goa street food review", "goa", "street_food"),
    ("panjim food review goa", "goa", "food_walk"),

    # ── JAIPUR ────────────────────────────────────────────────
    ("best restaurants in jaipur review", "jaipur", "restaurant"),
    ("jaipur street food review", "jaipur", "street_food"),
    ("best dal bati churma jaipur review", "jaipur", "cuisine"),
    ("jaipur food walk review", "jaipur", "food_walk"),
    ("best lassi in jaipur review", "jaipur", "street_food"),

    # ── LUCKNOW ───────────────────────────────────────────────
    ("best kebabs in lucknow review", "lucknow", "cuisine"),
    ("lucknow street food review tunday kababi", "lucknow", "street_food"),
    ("best biryani in lucknow review", "lucknow", "cuisine"),
    ("lucknow chaat food review", "lucknow", "street_food"),
    ("aminabad food walk lucknow review", "lucknow", "food_walk"),

    # ── AHMEDABAD ─────────────────────────────────────────────
    ("best street food in ahmedabad review", "ahmedabad", "street_food"),
    ("ahmedabad food review 2024", "ahmedabad", "general"),
    ("manek chowk food review ahmedabad", "ahmedabad", "food_walk"),
    ("best thali in ahmedabad review", "ahmedabad", "cuisine"),
    ("law garden food review ahmedabad", "ahmedabad", "street_food"),

    # ── KERALA ────────────────────────────────────────────────
    ("best restaurants in kochi review", "kerala", "restaurant"),
    ("kerala food review 2024", "kerala", "general"),
    ("best appam and stew in kerala review", "kerala", "cuisine"),
    ("fort kochi cafe review", "kerala", "cafe"),
    ("best fish curry in kerala review", "kerala", "cuisine"),
    ("munnar food review kerala", "kerala", "restaurant"),

    # ── THANE / NAVI MUMBAI ───────────────────────────────────
    ("great dining experiences in thane", "thane", "restaurant"),
    ("best restaurants in thane review", "thane", "restaurant"),
    ("thane street food review", "thane", "street_food"),
    ("navi mumbai food review", "navi_mumbai", "restaurant"),
    ("best vada pav in thane review", "thane", "street_food"),

    # ── VARANASI ──────────────────────────────────────────────
    ("varanasi street food review", "varanasi", "street_food"),
    ("best food in varanasi ghats review", "varanasi", "food_walk"),
    ("best lassi in varanasi review", "varanasi", "street_food"),

    # ── AMRITSAR ──────────────────────────────────────────────
    ("amritsar food review 2024", "amritsar", "general"),
    ("best kulcha in amritsar review", "amritsar", "cuisine"),
    ("amritsar street food review", "amritsar", "street_food"),

    # ── CHANDIGARH ────────────────────────────────────────────
    ("best restaurants in chandigarh review", "chandigarh", "restaurant"),
    ("chandigarh street food review", "chandigarh", "street_food"),
    ("sector 17 food review chandigarh", "chandigarh", "food_walk"),

    # ── GENERAL INDIA TERMS ───────────────────────────────────
    ("best food in india review 2024", "india", "general"),
    ("indian street food honest review", "india", "street_food"),
    ("best restaurant in india food blogger", "india", "restaurant"),
    ("hidden food gems india review", "india", "hidden_gem"),
    ("indian food vlogger honest restaurant review", "india", "general"),
    ("best thali in india review", "india", "cuisine"),
    ("best chai in india review", "india", "street_food"),
    ("famous food places india review", "india", "general"),
    ("best highway dhaba india review", "india", "dhaba"),
    ("indian cafe review aesthetic", "india", "cafe"),
]


def get_all_queries() -> list[tuple[str, str, str]]:
    """Return all queries as (query, region, category) tuples."""
    return INDIA_QUERIES
