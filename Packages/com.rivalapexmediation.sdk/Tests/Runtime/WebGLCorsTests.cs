using NUnit.Framework;
using UnityEngine;
using UnityEngine.Networking;

namespace RivalApex.Mediation.Tests.Runtime
{
    /// <summary>
    /// Validates that WebGL builds send the expected CORS preflight headers.
    /// </summary>
    public class WebGLCorsTests
    {
        [Test]
        public void ApplyCorsHeaders_SetsPreflightHeaders_ForWebGLPlatform()
        {
            using (var request = new UnityWebRequest("https://example.com", UnityWebRequest.kHttpVerbPOST))
            {
                request.uploadHandler = new UploadHandlerRaw(new byte[0]);
                request.downloadHandler = new DownloadHandlerBuffer();

                AuctionClient.ApplyCorsHeaders(request, RuntimePlatform.WebGLPlayer);

                Assert.AreEqual("POST", request.GetRequestHeader("Access-Control-Request-Method"));
                Assert.AreEqual("content-type,x-api-key", request.GetRequestHeader("Access-Control-Request-Headers"));
            }
        }

        [Test]
        public void ApplyCorsHeaders_DoesNothing_OnNonWebGLPlatforms()
        {
            using (var request = new UnityWebRequest("https://example.com", UnityWebRequest.kHttpVerbPOST))
            {
                AuctionClient.ApplyCorsHeaders(request, RuntimePlatform.OSXPlayer);

                Assert.IsNull(request.GetRequestHeader("Access-Control-Request-Method"));
                Assert.IsNull(request.GetRequestHeader("Access-Control-Request-Headers"));
            }
        }
    }
}
