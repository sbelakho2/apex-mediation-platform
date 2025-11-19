package com.rivalapexmediation.sdk.mapping

import com.rivalapexmediation.sdk.contract.AdapterError
import com.rivalapexmediation.sdk.contract.ErrorCode

/**
 * Error mapping helpers per Adapters.md section 3.
 * Maps vendor-specific error codes to normalized taxonomy.
 */

object ErrorMapper {
    
    /**
     * Moloco error mapping
     */
    fun mapMolocoError(code: Int, message: String): AdapterError {
        return when (code) {
            3001 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Moloco network error", code.toString())
            3002 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Moloco no fill", code.toString())
            3003 -> AdapterError.Fatal(ErrorCode.CONFIG, "Moloco invalid request", code.toString())
            3004 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "Moloco timeout", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Moloco error: $message", code.toString())
        }
    }
    
    /**
     * IronSource error mapping
     */
    fun mapIronSourceError(code: Int, message: String): AdapterError {
        return when (code) {
            508 -> AdapterError.Fatal(ErrorCode.NO_FILL, "IronSource no ads available", code.toString())
            509 -> AdapterError.Fatal(ErrorCode.CONFIG, "IronSource init failed", code.toString())
            510 -> AdapterError.Fatal(ErrorCode.NO_AD_READY, "IronSource ad not ready", code.toString())
            1022 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "IronSource network error", code.toString())
            1036 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "IronSource timeout", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "IronSource error: $message", code.toString())
        }
    }
    
    /**
     * Vungle error mapping
     */
    fun mapVungleError(code: Int, message: String): AdapterError {
        return when (code) {
            1 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Vungle no fill", code.toString())
            2 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Vungle network error", code.toString())
            3 -> AdapterError.Fatal(ErrorCode.CONFIG, "Vungle invalid config", code.toString())
            4 -> AdapterError.Fatal(ErrorCode.NO_AD_READY, "Vungle ad not playable", code.toString())
            10 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "Vungle timeout", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Vungle error: $message", code.toString())
        }
    }
    
    /**
     * Tapjoy error mapping
     */
    fun mapTapjoyError(code: Int, message: String): AdapterError {
        return when (code) {
            -1 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Tapjoy no content", code.toString())
            -1001 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Tapjoy network error", code.toString())
            -1003 -> AdapterError.Fatal(ErrorCode.CONFIG, "Tapjoy not initialized", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Tapjoy error: $message", code.toString())
        }
    }
    
    /**
     * Smaato error mapping
     */
    fun mapSmaatoError(code: Int, message: String): AdapterError {
        return when (code) {
            204 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Smaato no ads", code.toString())
            400, 401, 403 -> AdapterError.Fatal(ErrorCode.CONFIG, "Smaato config error", code.toString())
            500, 503 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Smaato server error", code.toString())
            in 500..599 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Smaato 5xx", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Smaato error: $message", code.toString())
        }
    }
    
    /**
     * Pangle error mapping
     */
    fun mapPangleError(code: Int, message: String): AdapterError {
        return when (code) {
            20001 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Pangle no ad", code.toString())
            40000 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Pangle network error", code.toString())
            40002 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "Pangle timeout", code.toString())
            40003 -> AdapterError.Fatal(ErrorCode.CONFIG, "Pangle invalid param", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Pangle error: $message", code.toString())
        }
    }
    
    /**
     * Mintegral error mapping
     */
    fun mapMintegralError(code: Int, message: String): AdapterError {
        return when (code) {
            -1 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Mintegral no fill", code.toString())
            -2 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Mintegral network error", code.toString())
            -3 -> AdapterError.Fatal(ErrorCode.CONFIG, "Mintegral invalid params", code.toString())
            -9 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "Mintegral timeout", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Mintegral error: $message", code.toString())
        }
    }
    
    /**
     * Fyber error mapping
     */
    fun mapFyberError(code: Int, message: String): AdapterError {
        return when (code) {
            5001 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Fyber no fill", code.toString())
            5002 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Fyber network error", code.toString())
            5003 -> AdapterError.Fatal(ErrorCode.CONFIG, "Fyber invalid request", code.toString())
            5010 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "Fyber timeout", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Fyber error: $message", code.toString())
        }
    }
    
    /**
     * Meta Audience Network error mapping
     */
    fun mapMetaError(code: Int, message: String): AdapterError {
        return when (code) {
            1001 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Meta no fill", code.toString())
            1000 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Meta network error", code.toString())
            2001 -> AdapterError.Fatal(ErrorCode.CONFIG, "Meta server error", code.toString())
            2002 -> AdapterError.Fatal(ErrorCode.CONFIG, "Meta internal error", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Meta error: $message", code.toString())
        }
    }
    
    /**
     * Chartboost error mapping
     */
    fun mapChartboostError(code: Int, message: String): AdapterError {
        return when (code) {
            101 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Chartboost no ad found", code.toString())
            102 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Chartboost network failure", code.toString())
            103 -> AdapterError.Fatal(ErrorCode.CONFIG, "Chartboost invalid config", code.toString())
            104 -> AdapterError.Fatal(ErrorCode.NO_AD_READY, "Chartboost no cached ad", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Chartboost error: $message", code.toString())
        }
    }
    
    /**
     * AppLovin error mapping
     */
    fun mapAppLovinError(code: Int, message: String): AdapterError {
        return when (code) {
            204 -> AdapterError.Fatal(ErrorCode.NO_FILL, "AppLovin no fill", code.toString())
            -103 -> AdapterError.Fatal(ErrorCode.NO_AD_READY, "AppLovin ad not ready", code.toString())
            -1001 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "AppLovin network unavailable", code.toString())
            -1009 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "AppLovin timeout", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "AppLovin error: $message", code.toString())
        }
    }
    
    /**
     * Amazon error mapping
     */
    fun mapAmazonError(code: Int, message: String): AdapterError {
        return when (code) {
            204 -> AdapterError.Fatal(ErrorCode.NO_FILL, "Amazon no fill", code.toString())
            400 -> AdapterError.Fatal(ErrorCode.CONFIG, "Amazon bad request", code.toString())
            500 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "Amazon server error", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "Amazon error: $message", code.toString())
        }
    }
    
    /**
     * AdMob error mapping
     */
    fun mapAdMobError(code: Int, message: String): AdapterError {
        return when (code) {
            3 -> AdapterError.Fatal(ErrorCode.NO_FILL, "AdMob no fill", code.toString())
            2 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "AdMob network error", code.toString())
            0 -> AdapterError.Fatal(ErrorCode.CONFIG, "AdMob internal error", code.toString())
            1 -> AdapterError.Fatal(ErrorCode.CONFIG, "AdMob invalid request", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "AdMob error: $message", code.toString())
        }
    }
    
    /**
     * AdColony error mapping
     */
    fun mapAdColonyError(code: Int, message: String): AdapterError {
        return when (code) {
            1 -> AdapterError.Fatal(ErrorCode.NO_FILL, "AdColony no fill", code.toString())
            2 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "AdColony network error", code.toString())
            3 -> AdapterError.Fatal(ErrorCode.CONFIG, "AdColony invalid config", code.toString())
            4 -> AdapterError.Fatal(ErrorCode.NO_AD_READY, "AdColony ad not loaded", code.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "AdColony error: $message", code.toString())
        }
    }
    
    /**
     * Generic HTTP status mapping
     */
    fun mapHttpStatus(status: Int): AdapterError {
        return when (status) {
            204 -> AdapterError.Fatal(ErrorCode.NO_FILL, "HTTP 204 No Content", status.toString())
            400, 401, 403, 404 -> AdapterError.Fatal(ErrorCode.CONFIG, "HTTP $status client error", status.toString())
            408 -> AdapterError.Recoverable(ErrorCode.TIMEOUT, "HTTP 408 Timeout", status.toString())
            in 500..599 -> AdapterError.Recoverable(ErrorCode.NETWORK_ERROR, "HTTP $status server error", status.toString())
            else -> AdapterError.Recoverable(ErrorCode.ERROR, "HTTP $status", status.toString())
        }
    }
}
