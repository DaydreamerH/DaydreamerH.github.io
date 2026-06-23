add_executable(04_textures mix_image.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(04_textures glfw opengl32)
endif()

foreach(FILE_NAME texture.vs texture.fs)
    add_custom_command(TARGET 04_textures POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:04_textures>/${FILE_NAME}"
    )
endforeach()

foreach(IMG_FILE wall.jpg awesomeface.png)
    add_custom_command(TARGET 04_textures POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
        "$<TARGET_FILE_DIR:04_textures>/${IMG_FILE}"
    )
endforeach()