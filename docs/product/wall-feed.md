# Wall feed and profile follows

The feed is available at `/feed`. **For you** combines follows, your own placements and other public walls signed by people who signed the same walls. **Following** lists public walls from profiles you follow, most recent change first. A profile can be followed before it publishes a wall. A follow is private and survives a profile rename.

Public walls remain accessible by their existing links. The owner can explicitly include a public wall in recommendations. This is off by default for existing and new walls. A follower or someone who placed an autograph on a wall may still see that public wall in their own feed. Draft and archived walls, and profiles of disabled accounts, are excluded. The feed returns only public wall data and existing public media URLs. It does not return the people or placements behind an affinity signal.

Rank on the server. A follow adds 100 points. A personal placement adds up to 45 points, decaying by one point every two days. Other signers shared with recent anchor walls add up to 32 points, four per signer. Recent public activity adds up to 21 points, falling by one point per day. An open wall adds six points. Without personal signals, rank opted-in walls by activity and openness. Break ties by activity time and wall ID. Use bounded discovery and affinity pools, and cursor pagination with a fixed ranking time.

Activity covers public wall changes, public appearance edits and placement activity already visible in the wall history. Private avatar imports and changes to the discovery setting do not count as activity. The feed is the place to track updates. This release does not send email or push notifications.
