var tmi = require("tmi.js");
var deepcopy = require("deepcopy");

var options = {
    options: {
        debug: true
    },
    connection: {
        reconnect: true
    },
    identity: {
        username: "<bot name here>",
        password:  "<bot authentication key here>"
    },
    channels: ["<Insert streamer channel here>"]
};

var owner_name;

var adventure_start_time = 0;
var adventure_off_cd_time = 0;
var adventure_cd = 3; // Minutes
var auto_adventure_launch_cd = 5; // Minutes

var monster_names = ["Igor", "Terrorstep", "Gutteeth", "Vexseeker", "Spectraltaur", "Barbbug", "Umbrapaw", "Stoneface", "Bob", "Josephine"];
var monster_suffixes = [" the Terrible", " the Devious", " the Flamboyant", " the Crybaby", " the Dreadful"];

var past_players = []; // Contains player objects

var starting_players = []; // Keep track of who was in the adventure, reward even if they die. Contains player indexes

var player = {
    health: 100,
    damage_done: 0,
    weapon_tier: 1,
    shield_tier: 1,
    name: "",
};

var monster = {
    health: 100,
    attack: 10,
    level: 1,
    name: "Igor"
};

var game = {
    players: [], // Contains player indexes
    monster: null,
    queuing: false,
    active: false
};

// Create a custom monster for the battle
function create_monster(channel)
{
    var roll, level, attack, health, name;
    // Monster level
    roll = Math.floor(Math.random() * 100); // Random integer between 0 and 99 (inclusive)
    if (roll >= 0 && roll < 1)
        level = 10;
    else if (roll >= 1 && roll < 3)
        level = 9;
    else if (roll >= 3 && roll < 6)
        level = 8;
    else if (roll >= 6 && roll < 10)
        level = 7;
    else if (roll >= 10 && roll < 15)
        level = 6;
    else if (roll >= 15 && roll < 22)
        level = 5;
    else if (roll >= 22 && roll < 32)
        level = 4;
    else if (roll >= 32 && roll < 47)
        level = 3;
    else if (roll >= 47 && roll < 68)
        level = 2;
    else
        level = 1;

    // Monster stats
    attack = 5 + 2 * level;
    health = Math.pow(2, level) * 100 - 100; 
    
    // Monster name generation
    if (level == 10)
        name = owner_name;
    else
    {
        roll = Math.floor(Math.random() * monster_names.length);
        name = monster_names[roll];
        roll = Math.floor(Math.random() * monster_suffixes.length);
        name += monster_suffixes[roll];
    }
    
    var created_monster = deepcopy(monster);
    created_monster.level = level;
    created_monster.health = health;
    created_monster.attack = attack;
    created_monster.name = name;
    game.monster = created_monster;
}

function queue_message(channel, message_num)
{
    client.say(channel, "An adventure is starting in " + ((message_num + 1) * 5).toString() + " seconds! Join in with !adventure_join");
    
    if (message_num <= 0)
        if (game.players.length > 0)
            setTimeout(function() {run_game(channel);}, 5000); // 5 second delay
        else
        {
            setTimeout(function() {
                game.queuing = false;
                client.say(channel, "Insufficient number of players, adventure ending");
            }, 2000); // 2 second delay
        }
    else
        setTimeout(function() {queue_message(channel, message_num - 1);}, 5000); // 5 second delay
}

// Queuing up a game, letting players join
function queue_game(channel)
{
    var message_num = 2;
    
    queue_message(channel, message_num);
}

function battle(channel, days_past)
{
    var message = "Day " + days_past + ": ";
    for (i = game.players.length - 1; i >= 0; i--)
    {   
        monster_damage_multiplier = Math.random() * 0.75 + 0.5;
        monster_damage = Math.floor((game.monster.attack - past_players[game.players[i]].shield_tier) * monster_damage_multiplier);
        if (monster_damage <= 0)
            monster_damage = 1;
        past_players[game.players[i]].health -= monster_damage;
        
        player_damage_multiplier = Math.floor(Math.random() * 11) + 5;
        
        var player_damage = past_players[game.players[i]].weapon_tier * player_damage_multiplier;
        past_players[game.players[i]].damage_done += player_damage
        game.monster.health -= player_damage;
        
        if (past_players[game.players[i]].health < 0)
            past_players[game.players[i]].health = 0;
        if (game.monster.health < 0)
            game.monster.health = 0;
        message += past_players[game.players[i]].name + " dealt " + (past_players[game.players[i]].weapon_tier * player_damage_multiplier).toString() + " damage and has " + (past_players[game.players[i]].health).toString() + " health left. ";
        if (past_players[game.players[i]].health <= 0)
            game.players.splice(i, 1);
    }
    if (game.players.length == 0 || game.monster.health <= 0)
        game.active = false;
    message += game.monster.name + " has " + (game.monster.health).toString() + " health left. ";
    
    console.log(message);
    //client.say(channel, message); // Constant messages are too much spam in chat
}

function rewards(channel, reward_level)
{
    message = "The adventure has ended! ";
    
    for (i = 0; i < starting_players.length; i++)
    {
        past_players[starting_players[i]].health = 100; // Reset health
        past_players[starting_players[i]].damage_done = 0; // Reset Damage Dealt
        if (game.players.length > 0)
        {
            var roll = Math.floor(Math.random() * 3); // 0 - 2 integer
            if (roll == 0) // weapon upgrade priority
            {
                roll = Math.floor(Math.random() * past_players[starting_players[i]].weapon_tier);
                if (roll == 0)
                {
                    past_players[starting_players[i]].weapon_tier += reward_level;
                    message += past_players[starting_players[i]].name + " got an upgraded weapon! ";
                }
            }
            else // shield upgrade
            {
                roll = Math.floor(Math.random() * past_players[starting_players[i]].shield_tier);
                if (roll == 0)
                {
                    past_players[starting_players[i]].shield_tier += reward_level;
                    message += past_players[starting_players[i]].name + " got an upgraded shield! ";
                }
            }
        }
    }
    
    client.say(channel, message);
}

// Adventure loop
function run_game(channel)
{
    game.queuing = false;
    game.active = true;
    var days_past = 1;
    
    client.say(channel, "The adventure has begun! Please wait for results....");
    starting_players = deepcopy(game.players);
    // var start = new Date().getTime();
    while (game.active) // Blocks everything
    {
        // if (new Date().getTime() - start > 5000) // 5 second delay
        // {
            battle(channel, days_past);
            // start = new Date().getTime();
            days_past++;
        // }
    }
        
    // Game has ended
    setTimeout(function() {
        var message = "After " + days_past + " days...";
    
        if (game.players.length == 0)
        {
            message += "All players have been defeated. "
            message += game.monster.name + " had " + game.monster.health + " health left. ";
        }
        if (game.monster.health <= 0)
        {
            message += game.monster.name + " has been vanquished! ";
            for (i = 0; i < starting_players.length; i++)
            {
                message += past_players[starting_players[i]].name + " dealt " + past_players[starting_players[i]].damage_done + " damage. ";
            }
        }
        
        client.say(channel, message);
    }, 2000); // 2 second delay
    
    // Reset adventure variables and go to rewards
    setTimeout(function() {
        rewards(channel, game.monster.level);
        game.players = [];
        game.monster = null;
    }, 4000); // 4 second delay
}

var client = new tmi.client(options);
client.connect();

function player_in(name)
{
    // Search all players in array
    for (i = 0; i < game.players.length; i++)
    {
        if (past_players[game.players[i]].name == name)
            return true;
    }
    
    return false;
}

function player_exists(name)
{
    // Search all players in array
    for (i = 0; i < past_players.length; i++)
    {
        if (past_players[i].name == name)
            return i;
    }
    
    return -1;
}

function adventure_join(channel, userstate)
{
    if (!game.queuing)
        client.say(channel, userstate["display-name"] + ", you cannot join an adventure right now");
    else
    {
        if (player_in(userstate["display-name"]))
        {
            client.say(channel, userstate["display-name"] + ", you have already joined the adventure");
            return;
        }
        
        var player_num;
        // Check if player data already exists
        if ((player_num = player_exists(userstate["display-name"])) < 0)
        {
            var created_player = deepcopy(player);
            created_player.name = userstate["display-name"];
            player_num = past_players.length;
            past_players.push(created_player);
        }
        
        game.players.push(player_num) // Add the player place in the players array for quick access during game
        // client.say(channel, userstate["display-name"] + " has joined the adventure");
    }
}

// Handle chat prompts
client.on("chat", function(channel, userstate, message, self) {
    // If someone messages the chat, we know chat is active so auto launch adventure when appropriate
    var current_time = new Date().getTime();
    if (adventure_off_cd_time != 0 && current_time - adventure_off_cd_time > auto_adventure_launch_cd * 60 * 1000) // X mins * 60 secs/min * 1000 millisecs/sec
    {
        adventure_start_time = current_time;
        adventure_off_cd_time = current_time;
        create_monster(channel);
        client.say(channel, "An adventure has started! " + game.monster.name + ", a level " + game.monster.level + " monster has been summoned!");
        game.queuing = true;
        queue_game(channel);
    }
    
    if (message.substring(0, 11) == '!adventure_') // Prevents accidental spamming and getting IP blocked from Twitch
    {
        if (message == "!adventure_help")
            client.say(channel, userstate["display-name"] + ", valid adventure commands are: !adventure_help, !adventure_start, !adventure_join, !adventure_check_items, !adventure_set_cd_minutes (mod only), and !adventure_set_auto_launch_minutes (mod only)");
        else if (message == "!adventure_start")
        {
            if (game.active || game.queuing)
                client.say(channel, userstate["display-name"] + ", an adventure is already in progress");
            else
            {
                if (current_time - adventure_start_time > adventure_cd * 60 * 1000) 
                {
                    adventure_start_time = current_time;
                    adventure_off_cd_time = current_time;
                    create_monster(channel);
                    client.say(channel, userstate["display-name"] + " has started an adventure! " + game.monster.name + ", a level " + game.monster.level + " monster has been summoned!");
                    game.queuing = true;
                    adventure_join(channel, userstate);
                    queue_game(channel);
                }
                else
                    client.say(channel, userstate["display-name"] + ", you think monsters grow on trees? Please wait " + Math.ceil((adventure_cd * 60 * 1000 - (current_time - adventure_start_time)) / 1000).toString() + " seconds before launching another adventure");
            }
        }
        else if (message == "!adventure_join")
        {
            adventure_join(channel, userstate);
        }
        else if (message == "!adventure_check_items")
        {
            var player_num;
            // Check if player data already exists
            if ((player_num = player_exists(userstate["display-name"])) < 0)
            {
                var created_player = deepcopy(player);
                created_player.name = userstate["display-name"];
                player_num = past_players.length;
                past_players.push(created_player);
            }
            
            client.say(channel, userstate["display-name"] + ", you have a Tier " + past_players[player_num].weapon_tier + " weapon and a Tier " + past_players[player_num].shield_tier + " shield");
        }
        else if (message.substring(0, 25) == "!adventure_set_cd_minutes")
        {
            if (userstate["mod"] || userstate["display-name"] === owner_name)
            {
                var mins = parseInt(message.substring(25, message.length));
                if (mins >= 1 && mins <= 15)
                {
                    adventure_cd = mins;
                    client.say(channel, userstate["display-name"] + ", has set the adventure cooldown to be " + mins + " minutes");
                }
                else
                    client.say(channel, userstate["display-name"] + ", unrecognized syntax. Valid format for this command is: !adventure_set_cd_minutes <minutes>, between 1 and 15 minutes");
            }
            else
                client.say(channel, userstate["display-name"] + ", sorry you have to be a mod to use this command");
        }
        else if (message.substring(0, 34) == "!adventure_set_auto_launch_minutes")
        {
            if (userstate["mod"] || userstate["display-name"] === owner_name)
            {
                var mins = parseInt(message.substring(34, message.length));
                if (mins >= adventure_cd && mins <= 60)
                {
                    auto_adventure_launch_cd = mins;
                    client.say(channel, userstate["display-name"] + ", has set the auto launch time to be " + mins + " minutes");
                }
                else
                    client.say(channel, userstate["display-name"] + ", unrecognized syntax. Valid format for this command is: !adventure_set_auto_launch_minutes <minutes>, between " + adventure_cd.toString() + " and 60 minutes");
            }
            else
                client.say(channel, userstate["display-name"] + ", sorry you have to be a mod to use this command");
        }
        else
            client.say(channel, userstate["display-name"] + ", that is not a valid adventure command");
    }
});

// Check connection to server
client.on("connected", function(server, port) {
    console.log("Server: " + server + " Port: " + port);
});

// Log why client was disconnected
client.on("disconnected", function (reason) {
    console.log("Disconnected: " + reason);
});

// Track who entered the chat
client.on("join", function(channel, username, self) {
    if (self)
    {
        owner_name = channel.replace(/^#/, '');
        owner_name = owner_name[0].toUpperCase() +  owner_name.substr(1);
        client.say(channel, "This chat is running Adventure Bot. Use !adventure_help for a list of adventure commands");
        
        adventure_off_cd_time = new Date().getTime()
    }
});

// Track who left the chat
client.on("part", function(channel, username, self) {
    if (self)
    {
        game.queuing = false;
        game.active = false;
        client.say(channel, "Adventure Bot has departed");
    }
});