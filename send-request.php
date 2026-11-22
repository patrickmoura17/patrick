<?php
declare(strict_types=1);

// Surffaces "Start your project" form handler.
// Emails each request to the company inbox, with the customer's photos attached,
// then sends the visitor to thank-you.html. Uses the hosting server's built-in mail().

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
  <link rel="stylesheet" href="/assets/styles.css">
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
        $attachments[] = [
            'name' => sprintf('photo-%02d.%s', count($attachments) + 1, $allowed[$type]),
            'type' => $type,
            'data' => file_get_contents($files['tmp_name'][$i]),
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

if (!function_exists('mail') || !mail(RECIPIENT, $subject, $body, $headers, '-f' . SENDER)) {
    page(503, 'Your request was not sent', 'Something went wrong on our side. Please try again in a few minutes.');
}

header('Location: /thank-you.html', true, 303);
exit;
