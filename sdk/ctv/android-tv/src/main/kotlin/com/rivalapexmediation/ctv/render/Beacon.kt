package com.rivalapexmediation.ctv.render

import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

internal object Beacon {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(2000, TimeUnit.MILLISECONDS)
        .readTimeout(2000, TimeUnit.MILLISECONDS)
        .build()

    fun fire(url: String) {
        try {
            val req = Request.Builder().url(url).get().build()
            client.newCall(req).enqueue(object: okhttp3.Callback {
                override fun onFailure(call: okhttp3.Call, e: java.io.IOException) { /* best effort */ }
                override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) { response.close() }
            })
        } catch (_: Throwable) { /* ignore */ }
    }
}
