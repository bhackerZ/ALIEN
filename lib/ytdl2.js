 //phistar
const playdl = require('play-dl');
const yts = require('youtube-yts');
const readline = require('readline');
const ffmpeg = require('fluent-ffmpeg');
const NodeID3 = require('node-id3');
const fs = require('fs');
const { fetchBuffer } = require("./myfunc");
const { randomBytes } = require('crypto');

const ytIdRegex = /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/;

class YT {
    constructor() {}

    static isYTUrl(url) {
        return ytIdRegex.test(url);
    }

    static getVideoID(url) {
        if (!this.isYTUrl(url)) throw new Error('Invalid YouTube URL');
        return ytIdRegex.exec(url)[1];
    }

    static async WriteTags(filePath, Metadata) {
        NodeID3.write({
            title: Metadata.Title,
            artist: Metadata.Artist,
            originalArtist: Metadata.Artist,
            image: {
                mime: 'jpeg',
                type: { id: 3, name: 'front cover' },
                imageBuffer: (await fetchBuffer(Metadata.Image)).buffer,
                description: `Cover of ${Metadata.Title}`,
            },
            album: Metadata.Album,
            year: Metadata.Year || ''
        }, filePath);
    }

    static async search(query, options = {}) {
        const search = await yts.search({ query, hl: 'id', gl: 'ID', ...options });
        return search.videos;
    }

    static async searchTrack(query) {
        const ytMusic = await playdl.search(query, { source: { youtube: "music" } });
        return ytMusic.map(track => ({
            isYtMusic: true,
            title: track.title,
            artist: track.artists?.join(", ") || "Unknown",
            id: track.id,
            url: `https://youtu.be/${track.id}`,
            album: track.album?.title || "Unknown",
            duration: {
                seconds: track.durationInSec,
                label: track.durationRaw
            },
            image: track.thumbnails?.[0]?.url.replace("w120-h120", "w600-h600") || ""
        }));
    }

    static async downloadMusic(query) {
        const tracks = Array.isArray(query) ? query : await this.searchTrack(query);
        const track = tracks[0];

        const stream = await playdl.stream(track.url);
        const songPath = `./Phistar-media/audio/${randomBytes(3).toString('hex')}.mp3`;

        await new Promise(resolve => {
            ffmpeg(stream.stream)
                .audioFrequency(44100)
                .audioChannels(2)
                .audioBitrate(128)
                .audioCodec('libmp3lame')
                .toFormat('mp3')
                .save(songPath)
                .on('end', resolve);
        });

        const videoInfo = await playdl.video_basic_info(track.url);
        const meta = {
            Title: track.title,
            Artist: track.artist,
            Image: track.image,
            Album: track.album,
            Year: videoInfo.video_details.upload_date.split('-')[0]
        };

        await this.WriteTags(songPath, meta);

        return {
            meta: track,
            path: songPath,
            size: fs.statSync(songPath).size
        };
    }

    static async mp4(query, quality = '134') {
        if (!query) throw new Error('Video ID or YouTube URL is required');
        const videoId = this.isYTUrl(query) ? this.getVideoID(query) : query;
        const videoInfo = await playdl.video_basic_info(`https://www.youtube.com/watch?v=${videoId}`);
        const stream = await playdl.stream(videoInfo.video_details.url, { quality });

        return {
            title: videoInfo.video_details.title,
            thumb: videoInfo.video_details.thumbnails?.[0]?.url,
            date: videoInfo.video_details.upload_date,
            duration: videoInfo.video_details.durationInSec,
            channel: videoInfo.video_details.channel.name,
            quality,
            videoUrl: stream.url
        };
    }

    static async mp3(url, metadata = {}, autoWriteTags = false) {
        if (!url) throw new Error('Video ID or YouTube URL is required');
        url = this.isYTUrl(url) ? `https://www.youtube.com/watch?v=${this.getVideoID(url)}` : url;

        const stream = await playdl.stream(url);
        const songPath = `./Alien-media/audio/${randomBytes(3).toString('hex')}.mp3`;

        await new Promise(resolve => {
            ffmpeg(stream.stream)
                .audioFrequency(44100)
                .audioChannels(2)
                .audioBitrate(128)
                .audioCodec('libmp3lame')
                .toFormat('mp3')
                .save(songPath)
                .on('end', resolve);
        });

        if (Object.keys(metadata).length) {
            await this.WriteTags(songPath, metadata);
        } else if (autoWriteTags) {
            const videoInfo = await playdl.video_basic_info(url);
            const autoMeta = {
                Title: videoInfo.video_details.title,
                Album: videoInfo.video_details.channel.name,
                Year: videoInfo.video_details.upload_date.split('-')[0],
                Image: videoInfo.video_details.thumbnails.slice(-1)[0]?.url
            };
            await this.WriteTags(songPath, autoMeta);
        }

        return {
            path: songPath,
            size: fs.statSync(songPath).size
        };
    }
}

module.exports = YT;