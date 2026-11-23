<?php
declare(strict_types=1);

// Surffaces "Start your project" form handler.
// Emails each request to the company inbox, with the customer's photos attached,
// then sends the visitor to thank-you.html.
//
// Sending: through the Hostinger Mail API from the contact@ mailbox itself, so the
// message is signed by the email service and lands in the inbox. The API key lives
// on the server only, in private/mail-api.php (never in this repository):
//   <?php return ['token' => '...', 'mailbox' => 'AC...'];
// If that file is missing or the API fails, it falls back to the server's mail().

const RECIPIENT   = 'contact@surffaces.com';   // where requests are delivered
const SENDER      = 'contact@surffaces.com';   // must be a mailbox on surffaces.com
const MAX_PHOTOS  = 10;
const MAX_PHOTO_MB = 10;
const MAX_TOTAL_MB = 25;                      // keeps the email under common size limits

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function page(int $status, string $title, string $message): never {
    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    $t = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $m = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    echo <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{$t} | Surffaces</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" href="/assets/img/favicon.png">
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/styles.css?v=ecb62214">
</head>
<body class="article-page">
  <header class="site-header scrolled">
    <a class="logo" href="/" aria-label="Surffaces home"><img class="logo-dark" src="/assets/img/logo-navy.png" alt="Surffaces" width="882" height="116"></a>
  </header>
  <main class="article status-page">
    <h1>{$t}</h1>
    <p>{$m}</p>
    <p>You can also call us at <a class="link nowrap" href="tel:+18542267060">(854) 226-7060</a> or email <a class="link" href="mailto:contact@surffaces.com">contact@surffaces.com</a>.</p>
    <a class="btn btn-solid" href="/#contact">Back to the form</a>
  </main>
</body>
</html>
HTML;
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    page(405, 'Please use the form', 'This page only receives requests sent from the contact form.');
}

// An empty POST usually means the upload was bigger than the server accepts.
if (empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    page(413, 'Your photos are too large', 'Please send fewer or smaller photos and try again.');
}

// Spam trap: real visitors never see or fill this field.
if (!empty($_POST['website'])) {
    header('Location: /thank-you.html', true, 303);
    exit;
}

function field(string $key, int $limit): string {
    $v = $_POST[$key] ?? '';
    if (!is_string($v)) return '';
    $v = trim(str_replace(["\r", "\0"], ' ', $v));
    return mb_substr($v, 0, $limit);
}

$name     = field('name', 120);
$email    = field('email', 254);
$phone    = field('phone', 40);
$room     = field('room', 60);
$timeline = field('timeline', 60);
$message  = trim(str_replace("\0", '', (string)($_POST['message'] ?? '')));
$message  = mb_substr($message, 0, 5000);

$interests = [];
foreach ((array)($_POST['interest'] ?? []) as $i) {
    if (in_array($i, ['Tile', 'Flooring', 'Cabinets', 'Countertops'], true)) $interests[] = $i;
}

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    page(422, 'Please check your details', 'We need your name and a valid email address so we can reply.');
}

// Phone photos are often 3-5 MB. Scale big ones down (long side 1800 px, JPEG)
// so the email stays small and sends quickly. Formats the server can't read
// (e.g. HEIC) are sent as they are.
function shrink(string $path, string $type): array {
    $raw = file_get_contents($path);
    if (!function_exists('imagecreatefromstring') || !in_array($type, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        return [$raw, $type];
    }
    $img = @imagecreatefromstring($raw);
    if (!$img) return [$raw, $type];
    if ($type === 'image/jpeg' && function_exists('exif_read_data')) {   // keep phone photos upright
        $o = (int)(@exif_read_data($path)['Orientation'] ?? 1);
        if ($o === 3) $img = imagerotate($img, 180, 0);
        elseif ($o === 6) $img = imagerotate($img, -90, 0);
        elseif ($o === 8) $img = imagerotate($img, 90, 0);
    }
    $w = imagesx($img); $h = imagesy($img); $max = 1800;
    $scale = min(1, $max / max($w, $h));
    if ($scale < 1) {
        $img = imagescale($img, (int)round($w * $scale), (int)round($h * $scale), IMG_BICUBIC);
    }
    $flat = imagecreatetruecolor(imagesx($img), imagesy($img));             // JPEG has no transparency
    imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
    imagecopy($flat, $img, 0, 0, 0, 0, imagesx($img), imagesy($img));
    ob_start(); imagejpeg($flat, null, 82); $out = ob_get_clean();
    return strlen($out) < strlen($raw) ? [$out, 'image/jpeg'] : [$raw, $type];
}

// ---- Photos ----
$attachments = [];
$total = 0;
$allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/heic' => 'heic', 'image/heif' => 'heif'];
$files = $_FILES['photos'] ?? null;
if ($files && is_array($files['name'])) {
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $count = count($files['name']);
    if ($count > MAX_PHOTOS) page(422, 'Too many photos', 'Please send up to ' . MAX_PHOTOS . ' photos.');
    for ($i = 0; $i < $count; $i++) {
        $err = $files['error'][$i];
        if ($err === UPLOAD_ERR_NO_FILE) continue;
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE || $files['size'][$i] > MAX_PHOTO_MB * 1024 * 1024) {
            page(413, 'A photo is too large', 'Each photo can be up to ' . MAX_PHOTO_MB . ' MB.');
        }
        if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($files['tmp_name'][$i])) {
            page(400, 'A photo did not upload', 'Please try attaching your photos again.');
        }
        $type = $finfo->file($files['tmp_name'][$i]) ?: '';
        if (!isset($allowed[$type])) {
            page(415, 'Photos only, please', 'Attachments must be images (JPG, PNG, WEBP, GIF or HEIC).');
        }
        $total += $files['size'][$i];
        if ($total > MAX_TOTAL_MB * 1024 * 1024) {
            page(413, 'Your photos are too large', 'Together, photos can be up to ' . MAX_TOTAL_MB . ' MB. Please send fewer or smaller photos.');
        }
        [$data, $outType] = shrink($files['tmp_name'][$i], $type);
        $attachments[] = [
            'name' => sprintf('photo-%02d.%s', count($attachments) + 1, $allowed[$outType]),
            'type' => $outType,
            'data' => $data,
        ];
    }
}

// ---- Build the email ----
$lines = [
    'New project request from surffaces.com',
    '',
    "Name:        $name",
    "Email:       $email",
    'Phone:       ' . ($phone ?: '-'),
    'Room:        ' . ($room ?: '-'),
    'Interested:  ' . ($interests ? implode(', ', $interests) : '-'),
    'Start:       ' . ($timeline ?: '-'),
    'Photos:      ' . count($attachments),
    '',
    'Project details:',
    $message !== '' ? $message : '-',
    '',
    '--',
    'Reply to this email to answer the customer directly.',
];
$text = implode("\r\n", $lines);

$subjectName = preg_replace('/[^\p{L}\p{N} .\'-]/u', '', $name);
$subject = '=?UTF-8?B?' . base64_encode('New project request: ' . $subjectName) . '?=';
$boundary = 'sf_' . bin2hex(random_bytes(12));

$headers = implode("\r\n", [
    'From: Surffaces Website <' . SENDER . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
    'X-Mailer: Surffaces contact form',
]);

$body  = "--$boundary\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: base64\r\n\r\n";
$body .= chunk_split(base64_encode($text)) . "\r\n";
foreach ($attachments as $a) {
    $body .= "--$boundary\r\n";
    $body .= "Content-Type: {$a['type']}; name=\"{$a['name']}\"\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n";
    $body .= "Content-Disposition: attachment; filename=\"{$a['name']}\"\r\n\r\n";
    $body .= chunk_split(base64_encode($a['data'])) . "\r\n";
}
$body .= "--$boundary--\r\n";

// HTML version with a one-click reply link (the API can't set Reply-To).
$e = fn(string $v) => htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$replyHref = 'mailto:' . rawurlencode($email) . '?subject=' . rawurlencode('Re: your Surffaces project request');
$rows = [
    ['Name', $name], ['Email', $email], ['Phone', $phone ?: '-'], ['Room', $room ?: '-'],
    ['Interested in', $interests ? implode(', ', $interests) : '-'], ['Start', $timeline ?: '-'],
    ['Photos', (string)count($attachments)],
];
$html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#0e253a">'
      . '<p><a href="' . $e($replyHref) . '" style="display:inline-block;background:#0e253a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Reply to ' . $e($name) . '</a></p>'
      . '<table cellpadding="6" style="border-collapse:collapse">';
foreach ($rows as [$k, $v]) $html .= '<tr><td style="color:#6b7886">' . $e($k) . '</td><td><strong>' . $e($v) . '</strong></td></tr>';
$html .= '</table><p style="color:#6b7886;margin-top:18px">Project details</p><p>' . nl2br($e($message !== '' ? $message : '-')) . '</p></div>';

function send_via_api(array $cfg, string $subject, string $text, string $html, array $attachments): bool {
    if (!function_exists('curl_init')) return false;
    $payload = [
        'to' => [RECIPIENT],
        'displayName' => 'Surffaces Website',
        'subject' => $subject,
        'text' => $text,
        'html' => $html,
        'attachments' => array_map(fn($a) => [
            'filename' => $a['name'], 'contentType' => $a['type'], 'content' => base64_encode($a['data']),
        ], $attachments),
    ];
    $ch = curl_init('https://api.mail.hostinger.com/api/v1/mailboxes/' . rawurlencode($cfg['mailbox']) . '/send');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $cfg['token'], 'Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 200 && $code < 300) return true;
    error_log('Surffaces form: Mail API send failed (' . $code . '): ' . substr((string)$resp, 0, 300));
    return false;
}

$cfgFile = __DIR__ . '/private/mail-api.php';
$cfg = is_file($cfgFile) ? (require $cfgFile) : null;
$sent = is_array($cfg) && !empty($cfg['token']) && !empty($cfg['mailbox'])
    && send_via_api($cfg, 'New project request: ' . $subjectName, $text, $html, $attachments);

if (!$sent && (!function_exists('mail') || !mail(RECIPIENT, $subject, $body, $headers, '-f' . SENDER))) {
    page(503, 'Your request was not sent', 'Something went wrong on our side. Please try again in a few minutes.');
}

header('Location: /thank-you.html', true, 303);
exit;
