using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;
using UnityEngine.Video;

namespace RivalApex.Mediation
{
    /// <summary>
    /// Lightweight creative renderer for demo/sandbox. Supports image (png/jpg)
    /// via UnityWebRequestTexture and video via VideoPlayer.
    /// Usage: Attach to a GameObject with a RawImage for images; for video, a
    /// VideoPlayer component will be created automatically.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public class CreativeRenderer : MonoBehaviour
    {
        [Header("Rendering Targets")]
        public RawImage ImageTarget;

        [Header("Config")]
        public bool MockMode = true; // if true, do not auto-track clicks/imp

        private VideoPlayer _videoPlayer;

        public void ShowImage(string url)
        {
            StopAllCoroutines();
            StartCoroutine(LoadTexture(url));
        }

        public void ShowVideo(string url, bool autoplay = true, bool loop = false)
        {
            EnsureVideoPlayer();
            _videoPlayer.url = url;
            _videoPlayer.isLooping = loop;
            if (autoplay) _videoPlayer.Play();
        }

        private void EnsureVideoPlayer()
        {
            if (_videoPlayer == null)
            {
                _videoPlayer = gameObject.AddComponent<VideoPlayer>();
                _videoPlayer.renderMode = VideoRenderMode.CameraFarPlane;
                _videoPlayer.playOnAwake = false;
                _videoPlayer.waitForFirstFrame = true;
            }
        }

        private IEnumerator LoadTexture(string url)
        {
            using (var req = UnityWebRequestTexture.GetTexture(url))
            {
                req.timeout = 10;
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Logger.LogWarning($"Creative image load failed: {req.responseCode} {req.error}");
                    yield break;
                }
                var tex = DownloadHandlerTexture.GetContent(req);
                if (ImageTarget == null)
                {
                    var go = new GameObject("CreativeImage");
                    go.transform.SetParent(transform, false);
                    ImageTarget = go.AddComponent<RawImage>();
                    var rt = go.GetComponent<RectTransform>();
                    rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
                }
                ImageTarget.texture = tex;
            }
        }
    }
}
