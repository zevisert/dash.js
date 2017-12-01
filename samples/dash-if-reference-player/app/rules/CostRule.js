/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2016, University of Victoria (Author: keybase.io/zevisert).
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

var CustomCostRule;

function CustomCostRuleClass() {

    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let DashMetrics = factory.getSingletonFactoryByName('DashMetrics');
    let ManifestModel = factory.getSingletonFactoryByName('ManifestModel');
    let DashManifestModel = factory.getSingletonFactoryByName('DashManifestModel');
    let Debug = factory.getSingletonFactoryByName('Debug');
    
    let context = this.context;
    let debug = Debug(context).getInstance();

    function getMaxIndex(rulesContext) {

        const metricsModel = MetricsModel(context).getInstance();
        const dashMetrics = DashMetrics(context).getInstance();
        const manifestModel = ManifestModel(context).getInstance();
        const dashManifestModel = DashManifestModel(context).getInstance();
        const mediaType = rulesContext.getMediaInfo().type;
        const metrics = metricsModel.getReadOnlyMetricsFor(mediaType);

        const manifest = manifestModel.getValue();
        const mpd = dashManifestModel.getMpd(manifest);

        const asGiB = bytes => bytes / Math.pow(1024, 3);

        // Total cost of representation i
        const T = rulesContext.getRepresentationInfo().mediaInfo.bitrateList.map(b => 
            document.getElementById('data-cost').value * asGiB(b.bandwidth) * mpd.mediaPresentationDuration
        );

        // Cost for one second of media in representation i assuming each second is the same amount of data
        const S = T.map(T_i => T_i / mpd.mediaPresentationDuration);

        // Cost expended this far
        const R = dashMetrics.getCumulativeCost(metrics, document.getElementById("data-cost").value);

        // Remaining cost from now until end
        const time = Math.round(rulesContext.getStreamProcessor().getIndexHandler().getCurrentTime() * 100 + Number.EPSILON) / 100;
        const Q = S.map(S_i => S_i * (mpd.mediaPresentationDuration - time));

        // Next segment should be the highest quality representation (i, index) such that we can keep this quality without cost overrun
        const m = document.getElementById('data-payment').value;
        const C_i = Q.filter(Q_i => R + Q_i < m).length - 1;

        /* TODO: The allowed cost (m) is for the whole stream - video, audio, subtitles, ads, etc - but 
        *  we're currently only comparing it against mediaType. So theoretically, if m = $1.00, video allowance
        *  is $1, audio allowance is $1, subtitle allowance (phew) is also $1. Need to keep Q_i(?) in mind for different
        *  mediaTypes. 
        */
        if (C_i >= 0) {
            // We can still watch the whole stream
            let currentIndex = rulesContext.getRepresentationInfo().quality;

            if (C_i !== currentIndex) {
                debug.log(`[CustomRules][${mediaType}][CostRule] Requesting change to quality: ${C_i} because ${
                    C_i > currentIndex ? "player can have better quality" : "stream is going to be too expensive"
                }`);
                return SwitchRequest(context).create(C_i, {name: CustomCostRuleClass.__dashjs_factory_name}, SwitchRequest.PRIORITY.STRONG);
            } // else already at the ideal cost/quality

        } else {
            debug.log(`[CustomRules][${mediaType}][CostRule] Cost overrun forecasted!`);
        }
        
        // No change
        return SwitchRequest(context).create();
    }

    const instance = {
        getMaxIndex: getMaxIndex
    };
    return instance;
}

CustomCostRuleClass.__dashjs_factory_name = 'CustomCostRule';
CustomCostRule = dashjs.FactoryMaker.getClassFactory(CustomCostRuleClass);

