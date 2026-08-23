<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class DriverReport extends Model
{
    protected $fillable = [
        'driver_id',
        'latitude',
        'longitude',
        'type',
        'location',
    ];

    protected static function booted()
    {
        static::creating(function (DriverReport $report) {
            if ($report->latitude && $report->longitude) {
                $lng = (float) $report->longitude;
                $lat = (float) $report->latitude;
                $report->location = DB::raw("ST_SetSRID(ST_MakePoint($lng, $lat), 4326)");
            }
        });
    }
}