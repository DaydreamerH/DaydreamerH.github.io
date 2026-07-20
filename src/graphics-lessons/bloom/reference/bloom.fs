#version 330 core
layout (location = 0) out vec4 FragColor;
layout (location = 1) out vec4 BrightColor;

in VS_OUT {
    vec3 FragPos;
    vec3 Normal;
    vec2 TexCoords;
} fs_in;

struct Light {
    vec3 Position;
    vec3 Color;
};

uniform Light lights[4];
uniform sampler2D diffuseTexture;
uniform vec3 viewPos;

void main()
{
    vec3 color = texture(diffuseTexture, fs_in.TexCoords).rgb;
    vec3 normal = normalize(fs_in.Normal);

    vec3 ambient = vec3(0.f);
    vec3 lighting = vec3(0.f);
    
    vec3 viewDir = normalize(viewPos - fs_in.FragPos);
    for (int i = 0; i<4; ++i)
    {
        vec3 lightDir = normalize(lights[i].Position - fs_in.FragPos);
        float diff = max(dot(lightDir, normal), 0.f);
        vec3 diffuse = lights[i].Color * diff * color;

        float distance = length(fs_in.FragPos - lights[i].Position);
        diffuse *= 1.f / (distance * distance);
        lighting += diffuse;
    }

    vec3 result = ambient + lighting;
    float brightness = dot(result, vec3(0.2126, 0.7152, 0.0722));
    if (brightness > 1.f)
        BrightColor = vec4(result, 1.f);
    else
        BrightColor = vec4(0.f, 0.f, 0.f, 1.f);
    FragColor = vec4(result, 1.f);
}