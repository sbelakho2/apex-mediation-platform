package com.rivalapexmediation.ctv.render

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.rivalapexmediation.ctv.util.Logger

internal class VideoRenderer(private val context: Context) {
    private var player: ExoPlayer? = null

    fun attach(playerView: PlayerView) {
        if (player == null) player = ExoPlayer.Builder(context).build()
        playerView.player = player
    }

    fun play(url: String, onReady: (() -> Unit)? = null, onEnded: (() -> Unit)? = null) {
        val p = player ?: return
        try {
            p.setMediaItem(MediaItem.fromUri(url))
            p.prepare()
            p.playWhenReady = true
            p.addListener(object: androidx.media3.common.Player.Listener {
                override fun onRenderedFirstFrame() {
                    onReady?.invoke()
                }
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == androidx.media3.common.Player.STATE_ENDED) onEnded?.invoke()
                }
            })
        } catch (e: Exception) {
            Logger.w("VideoRenderer error: ${e.message}", e)
        }
    }

    fun stop() {
        try { player?.stop() } catch (_: Throwable) {}
    }

    fun release() {
        try { player?.release() } catch (_: Throwable) {}
        player = null
    }
}
