<?php

namespace App\Http\Controllers;

use App\Events\DriverLocationUpdated;
use App\Models\DriverReport;
use Illuminate\Http\Request;

class DriverLocationController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'driver_id' => 'required|integer',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type' => 'sometimes|in:location,accident,traffic,breakdown',
        ]);

        $report = DriverReport::create([
            'driver_id' => $validated['driver_id'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'type' => $validated['type'] ?? 'location',
        ]);

        broadcast(new DriverLocationUpdated($report));

        return response()->json($report, 201);
    }

    public function index()
    {
        return DriverReport::latest()->take(100)->get();
    }
}
