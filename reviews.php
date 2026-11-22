<?php
declare(strict_types=1);

// Live Google reviews for the Reviews section.
// Asks Google (Places API) for the business's reviews at most once a day, keeps a copy
// in private/reviews-cache.json, and returns the newest 3 as JSON for assets/script.js.
//
// Needs a settings file on the server only (never in this repository):
//   private/google-places.php
//   <?php return ['api_key' => '...', 'place_id' => 'ChIJ...'];
// place_id is optional: without it, the business is looked up by name once and remembered.

const CACHE_FILE  = __DIR__ . '/private/reviews-cache.json';
const CONFIG_FILE = __DIR__ . '/private/google-places.php';
const CACHE_HOURS = 24;
const SHOW        = 3;
const SEARCH_TEXT = 'Surffaces Myrtle Beach SC';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');

function out(array $data): never { echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }

$cache = is_file(CACHE_FILE) ? json_decode((string)file_get_contents(CACHE_FILE), true) : null;
$fresh = is_array($cache) && isset($cache['fetched_at']) && (time() - (int)$cache['fetched_at']) < CACHE_HOURS * 3600;
if ($fresh) out($cache['public']);

$cfg = is_file(CONFIG_FILE) ? (require CONFIG_FILE) : null;
if (!is_array($cfg) || empty($cfg['api_key']) || !function_exists('curl_init')) {
    out(is_array($cache) ? $cache['public'] : ['reviews' => []]);   // not set up yet
}

function google(string $method, string $url, string $key, string $fields, ?array $body = null): ?array {
    $ch = curl_init($url);
    $headers = ['X-Goog-Api-Key: ' . $key, 'X-Goog-FieldMask: ' . $fields, 'Content-Type: application/json'];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) { error_log("Surffaces reviews: Google $code " . substr((string)$resp, 0, 300)); return null; }
    return json_decode((string)$resp, true);
}

$key = (string)$cfg['api_key'];
$placeId = (string)($cfg['place_id'] ?? ($cache['place_id'] ?? ''));
if ($placeId === '') {
    $found = google('POST', 'https://places.googleapis.com/v1/places:searchText', $key, 'places.id,places.displayName', ['textQuery' => SEARCH_TEXT]);
    $placeId = (string)($found['places'][0]['id'] ?? '');
}

$place = $placeId !== ''
    ? google('GET', 'https://places.googleapis.com/v1/places/' . rawurlencode($placeId), $key, 'rating,userRatingCount,reviews,googleMapsUri')
    : null;

if ($place === null) {
    // Google unreachable or misconfigured: keep showing the last good copy, and retry in an hour.
    $public = is_array($cache) ? $cache['public'] : ['reviews' => []];
    @file_put_contents(CACHE_FILE, json_encode(['fetched_at' => time() - (CACHE_HOURS - 1) * 3600, 'place_id' => $placeId, 'public' => $public]), LOCK_EX);
    out($public);
}

$reviews = [];
foreach ((array)($place['reviews'] ?? []) as $r) {
    $text = trim((string)($r['originalText']['text'] ?? $r['text']['text'] ?? ''));
    if ($text === '') continue;                        // star-only ratings have nothing to show
    $reviews[] = [
        'author'  => (string)($r['authorAttribution']['displayName'] ?? 'Google user'),
        'author_url' => (string)($r['authorAttribution']['uri'] ?? ''),
        'rating'  => (int)($r['rating'] ?? 0),
        'text'    => mb_substr($text, 0, 600),
        'when'    => (string)($r['relativePublishTimeDescription'] ?? ''),
        'time'    => (string)($r['publishTime'] ?? ''),
    ];
}
usort($reviews, fn($a, $b) => strcmp($b['time'], $a['time']));   // newest first

$public = [
    'rating'  => isset($place['rating']) ? round((float)$place['rating'], 1) : null,
    'count'   => (int)($place['userRatingCount'] ?? 0),
    'url'     => (string)($place['googleMapsUri'] ?? ''),
    'reviews' => array_slice($reviews, 0, SHOW),
];
@file_put_contents(CACHE_FILE, json_encode(['fetched_at' => time(), 'place_id' => $placeId, 'public' => $public], JSON_UNESCAPED_UNICODE), LOCK_EX);
out($public);
