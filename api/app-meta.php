<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_SLASHES);
    exit;
}

$packagePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'package.json';
$version = '';

if (is_file($packagePath) && is_readable($packagePath)) {
    $packageJson = file_get_contents($packagePath);
    if (is_string($packageJson) && $packageJson !== '') {
        $decoded = json_decode($packageJson, true);
        if (is_array($decoded) && array_key_exists('version', $decoded)) {
            $version = trim((string)$decoded['version']);
        }
    }
}

echo json_encode(['version' => $version], JSON_UNESCAPED_SLASHES);
