<?php

use App\Http\Controllers\DriverLocationController;
use App\Models\DriverReport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::post('/driver-location', [DriverLocationController::class, 'store']);
Route::get('/driver-reports', function () {
    return DriverReport::latest()->take(100)->get();
});
